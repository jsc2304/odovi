#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync, openSync, closeSync, chmodSync, existsSync } from 'node:fs';
import { createHash, randomBytes } from 'node:crypto';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:net';
import assert from 'node:assert/strict';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const fixture = join(root, 'acceptance/rename-upgrade');
const artifact = JSON.parse(readFileSync(join(fixture, 'legacy-artifact.json')));
const project = `odovi-upgrade-${Date.now()}-${randomBytes(3).toString('hex')}`;
const evidence = resolve(process.env.ODOVI_UPGRADE_EVIDENCE_DIR ?? join(root, 'acceptance-results', project));
mkdirSync(dirname(evidence), { recursive: true });
mkdirSync(evidence, { mode: 0o700 });
const log = openSync(join(evidence, 'commands.log'), 'wx', 0o600);
let owned = false, activeModel;
const phases = [];
const startedAt = new Date().toISOString();
const run = (command, args, options = {}) => new Promise((resolvePromise, reject) => {
  const { capture = false, input, ...rest } = options;
  const child = spawn(command, args, { cwd: root, stdio: [input ? 'pipe' : 'ignore', capture ? 'pipe' : log, log], ...rest });
  let output = '';
  if (capture) child.stdout.on('data', b => { output += b; });
  if (input) child.stdin.end(input);
  child.once('error', reject);
  child.once('exit', code => code === 0 ? resolvePromise(output.trim()) : reject(new Error(`${command} ${args.slice(0,3).join(' ')} failed (${code}); see ${evidence}/commands.log`)));
});
const docker = (args, options) => run('docker', args, options);
const dc = (model, args, options) => docker(['compose', '--project-name', project, '--file', model, ...args], options);
const sql = (model, query) => dc(model, ['exec','-T','db','psql','-X','-v','ON_ERROR_STOP=1','-U','archive_owner','-d','journey_archive','-At'], { capture: true, input: query });
const mark = (name, data = {}) => { phases.push({ name, at: new Date().toISOString(), ...data }); console.log(`[rename-upgrade] ${name}`); };
const wait = async (name, check) => {
  for (let i = 0; i < 90; i++) {
    try { if (await check()) return; } catch {}
    await new Promise(r => setTimeout(r, 2000));
  }
  throw new Error(`Timed out: ${name}`);
};
const backup = (model, name, action = 'backup') => run(process.execPath, [join(root,'scripts/database-backup.mjs'), action,
  '--project', project, '--file', model, '--directory', join(evidence,name), ...(action === 'restore' ? ['--confirm',`${project}/journey_archive`] : [])]);
const snapshot = async (model, name) => {
  const data = JSON.parse(await sql(model, readFileSync(join(fixture,'snapshot.sql'))));
  writeFileSync(join(evidence,`${name}.json`), JSON.stringify(data,null,2), { mode: 0o600 });
  return data;
};
let commit, version, imageEvidence, dirty;
try {
  assert(existsSync(join(root,'acceptance/release-stack/node_modules/@playwright/test')),
    'Install acceptance dependencies first: cd acceptance/release-stack && npm ci && npm exec -- playwright install chromium');
  await docker(['info']);
  for (const kind of ['ps','volume','network']) {
    const args = kind === 'ps' ? ['ps','--all','--quiet'] : [kind,'ls','--quiet'];
    assert.equal(await docker([...args,'--filter',`label=com.docker.compose.project=${project}`],{capture:true}), '', 'Refusing an existing project');
  }
  commit = await run('git',['rev-parse','HEAD'],{capture:true});
  dirty = (await run('git',['status','--porcelain'],{capture:true})) !== '';
  if(dirty && process.env.ODOVI_UPGRADE_ALLOW_DIRTY !== '1') throw new Error('Commit the complete worktree before exact release acceptance (or use ODOVI_UPGRADE_ALLOW_DIRTY=1 only for development).');
  version = process.env.ODOVI_ACCEPTANCE_VERSION ?? `0.3.0-dev.${commit.slice(0,12)}`;
  const port = await new Promise(r => { const s=createServer();s.listen(0,'127.0.0.1',()=>{ const p=s.address().port;s.close(()=>r(p)); }); });
  const base = `http://127.0.0.1:${port}`;
  const sourceDir = join(evidence,`odovi-${artifact.commit}`);
  const archive = Buffer.from(await (await fetch(artifact.url)).arrayBuffer());
  assert.equal(createHash('sha256').update(archive).digest('hex'),artifact.sha256,'Pinned public source checksum');
  writeFileSync(join(evidence,'v0.1.1.tar.gz'),archive,{mode:0o600});
  await run('tar',['-xzf',join(evidence,'v0.1.1.tar.gz'),'-C',evidence]);
  writeFileSync(join(evidence,'public-artifact.json'),JSON.stringify(artifact,null,2));
  const oldImages = { web: `odovi-upgrade-legacy-web:${artifact.commit.slice(0,12)}`, worker: `odovi-upgrade-legacy-worker:${artifact.commit.slice(0,12)}` };
  const newImages = { web: process.env.ODOVI_UPGRADE_WEB_IMAGE ?? `odovi-web:${version}`, worker: process.env.ODOVI_UPGRADE_WORKER_IMAGE ?? `odovi-worker:${version}` };
  for(const image of Object.values(newImages)) assert(!image.endsWith(':latest') && /(@sha256:|:[^/]+$)/.test(image),'Exact image reference required');
  for (const [service,image] of Object.entries(oldImages)) {
    await docker(['build','--file',join(sourceDir,`apps/${service}/Dockerfile`),'--tag',image,sourceDir]);
  }
  for (const [service,image] of Object.entries(newImages)) {
    if (process.env.ODOVI_UPGRADE_BUILD !== '0') await docker(['build','--file',join(root,`apps/${service}/Dockerfile`),'--build-arg',`ODOVI_VERSION=${version}`,'--build-arg',`ODOVI_COMMIT_SHA=${commit}`,'--tag',image,root]);
  }
  imageEvidence = JSON.parse(await docker(['image','inspect',...Object.values(oldImages),...Object.values(newImages)],{capture:true}));
  for(const image of imageEvidence.slice(2)) {
    assert.equal(image.Config.Labels['org.opencontainers.image.revision'],commit,'Current runtime must match checked-out commit');
    assert.equal(image.Config.Labels['org.opencontainers.image.version'],version,'Current runtime must match accepted version');
  }
  // Freeze the exact built images for every later restore/rollback operation.
  oldImages.web=imageEvidence[0].Id; oldImages.worker=imageEvidence[1].Id;
  newImages.web=imageEvidence[2].Id; newImages.worker=imageEvidence[3].Id;
  writeFileSync(join(evidence,'images.json'),JSON.stringify(imageEvidence,null,2));
  mark('pinned-public-v0.1.1-built', { commit: artifact.commit, archiveSha256: artifact.sha256 });

  const password = 'synthetic-upgrade-database';
  const dbUrl = `postgres://archive_owner:${password}@db:5432/journey_archive`;
  const envFile = join(evidence,'acceptance.env');
  const env = { ...process.env, POSTGRES_PASSWORD: password, WEB_PORT: String(port),
    TESLAMATE_DATABASE_URL:'postgres://teslamate:synthetic@teslamate-db:5432/teslamate',
    ODOVI_ENV_FILE:envFile, ODOVI_DB_USER:'archive_owner', ODOVI_DB_NAME:'journey_archive',
    ODOVI_DB_VOLUME_NAME:`${project}_tripatlas-db-data`, INITIAL_ADMIN_PASSWORD:'',
    // These placeholders only satisfy interpolation: local exact images replace them below.
    ODOVI_WEB_DIGEST:`sha256:${'0'.repeat(64)}`, ODOVI_WORKER_DIGEST:`sha256:${'0'.repeat(64)}` };
  writeFileSync(envFile,'# Synthetic-only acceptance configuration\n',{mode:0o600});
  const oldModel = JSON.parse(await docker(['compose','--project-name',project,'--file',join(sourceDir,'docker-compose.yml'),'config','--format','json'],{env,capture:true}));
  const newModel = JSON.parse(await docker(['compose','--project-name',project,'--file',join(root,'release/0.3.0/docker-compose.yml'),'config','--format','json'],{env,capture:true}));
  const volume = `${project}_tripatlas-db-data`;
  const guard = join(root,'acceptance/release-stack/egress-guard.cjs');
  for (const [model,images,legacy] of [[oldModel,oldImages,true],[newModel,newImages,false]]) {
    model.name=project;
    model.networks={ default:{name:`${project}_default`,internal:true}, ingress:{name:`${project}_ingress`} };
    for (const [name,service] of Object.entries(model.services)) {
      delete service.build;
      service.networks={default:null};
      if (name==='db') {
        service.environment={POSTGRES_USER:'archive_owner',POSTGRES_DB:'journey_archive',POSTGRES_PASSWORD:password};
        service.healthcheck={test:['CMD-SHELL','pg_isready -U archive_owner -d journey_archive'],interval:'2s',timeout:'3s',retries:30};
        service.volumes=[{type:'volume',source:'archive-data',target:'/var/lib/postgresql/data'}];
      } else {
        service.image=name==='web'?images.web:images.worker;
        service.environment={...service.environment,...(name!=='config-check'?{DATABASE_URL:dbUrl}:{})};
        if(legacy) service.environment.INITIAL_ADMIN_PASSWORD='Synthetic-upgrade-password-2026';
        if (name==='worker') service.environment.SYNC_INTERVAL_SECONDS='5';
        if (name==='web'||name==='worker') {
          service.environment.NODE_OPTIONS='--require=/opt/odovi-egress-guard.cjs';
          service.environment.ODOVI_ACCEPTANCE_EGRESS_LOG=`/evidence/${legacy?'legacy':'current'}-egress.ndjson`;
          service.volumes=[{type:'bind',source:guard,target:'/opt/odovi-egress-guard.cjs',read_only:true},{type:'bind',source:evidence,target:'/evidence'}];
        }
        if(name==='web') { service.ports=[{target:3000,published:String(port),host_ip:'127.0.0.1',protocol:'tcp'}]; service.networks.ingress=null; }
      }
    }
    model.volumes={'archive-data':{name:volume},'teslamate-data':{name:`${project}_teslamate-data`}};
    model.services['teslamate-db']={image:'postgres:17-alpine',environment:{POSTGRES_USER:'teslamate',POSTGRES_DB:'teslamate',POSTGRES_PASSWORD:'synthetic'},networks:{default:null},volumes:[
      {type:'volume',source:'teslamate-data',target:'/var/lib/postgresql/data'},
      {type:'bind',source:join(root,'dev/fixtures/teslamate/v4.0.1/schema.sql'),target:'/docker-entrypoint-initdb.d/01_schema.sql',read_only:true}],
      healthcheck:{test:['CMD-SHELL','pg_isready -U teslamate'],interval:'2s',timeout:'3s',retries:30}};
  }
  for(const filename of ['legacy-egress.ndjson','current-egress.ndjson','browser-egress.ndjson']) {
    writeFileSync(join(evidence,filename),'',{mode:0o666}); chmodSync(join(evidence,filename),0o666);
  }
  // Database snapshots/checkpoints remain private; only synthetic guard logs need container write access.
  chmodSync(evidence,0o755);
  const legacyFile=join(evidence,'legacy.compose.json'), upgradedFile=join(evidence,'upgraded.compose.json');
  writeFileSync(legacyFile,JSON.stringify(oldModel,null,2),{mode:0o600});
  writeFileSync(upgradedFile,JSON.stringify(newModel,null,2),{mode:0o600});
  owned=true; activeModel=legacyFile;
  await dc(legacyFile,['up','-d','--wait','db','teslamate-db']);
  await dc(legacyFile,['run','--rm','--no-deps','migrate']);
  await sql(legacyFile,readFileSync(join(fixture,'seed.sql')));
  await dc(legacyFile,['up','-d','--no-deps','web','worker']);
  await wait('legacy web',async()=> (await fetch(`${base}/api/health`)).ok);
  const browser = async stage => {
    await run('npm',['exec','--','playwright','test','--config','playwright.config.ts','--project=desktop','tests/rename-upgrade.spec.ts'],{
      cwd:join(root,'acceptance/release-stack'),env:{...process.env,ODOVI_UPGRADE_STAGE:stage,ODOVI_ACCEPTANCE_BASE_URL:base,ODOVI_ACCEPTANCE_EVIDENCE_DIR:evidence,
        ODOVI_ACCEPTANCE_PHASE:`upgrade-${stage}`,ODOVI_ACCEPTANCE_VERSION:version,ODOVI_ACCEPTANCE_GIT_COMMIT:commit,
        ODOVI_ACCEPTANCE_BROWSER_EGRESS_LOG:join(evidence,stage==='legacy'||stage==='rollback'?'legacy-browser-egress.ndjson':'browser-egress.ndjson')}});
  };
  await browser('legacy');
  await dc(legacyFile,['stop','web','worker']);
  const baseline=await snapshot(legacyFile,'before-upgrade');
  const syncBefore=await sql(legacyFile,'select coalesce(jsonb_agg(to_jsonb(t) order by source,entity),\'[]\') from sync_state t;');
  writeFileSync(join(evidence,'sync-before.json'),syncBefore);
  await backup(legacyFile,'pre-upgrade-backup');
  mark('legacy-working-state-backed-up');

  activeModel=upgradedFile;
  await dc(upgradedFile,['run','--rm','--no-deps','config-check']);
  await dc(upgradedFile,['run','--rm','--no-deps','migrate']);
  assert.deepEqual(await snapshot(upgradedFile,'after-migration'),baseline);
  assert.equal(await sql(upgradedFile,'select coalesce(jsonb_agg(to_jsonb(t) order by source,entity),\'[]\') from sync_state t;'),syncBefore);
  assert.equal(await sql(upgradedFile,'select count(*) from location_provider_decisions;'),'0');
  await dc(upgradedFile,['up','-d','--no-deps','web']);
  await wait('upgraded web',async()=> (await fetch(`${base}/api/health`)).ok);
  await browser('upgraded');
  assert.equal(await sql(upgradedFile,"select count(*) from location_provider_decisions where mode='disabled';"),'6');
  await dc(upgradedFile,['up','-d','--no-deps','worker']);
  await wait('upgraded worker sync',async()=>await sql(upgradedFile,"select count(*) from sync_state where source='odovi' and entity='worker' and last_status='ok';")==='1');
  await dc(upgradedFile,['stop','web','worker']);
  assert.deepEqual(await snapshot(upgradedFile,'after-upgrade'),baseline);
  await backup(upgradedFile,'upgraded-backup');
  mark('upgrade-preserves-records-auth-exports-and-review');

  const destroy = async model => {
    const names=await docker(['volume','ls','--quiet','--filter',`label=com.docker.compose.project=${project}`],{capture:true});
    assert(names.split('\n').every(n=>n.startsWith(`${project}_`)),'Only owned disposable volumes may be removed');
    await dc(model,['down','--volumes','--remove-orphans','--timeout','10']);
    const remaining=await docker(['volume','ls','--quiet','--filter',`label=com.docker.compose.project=${project}`],{capture:true});
    assert.equal(remaining,'','Disposable stack must really lose its volumes');
  };
  await destroy(upgradedFile);
  mark('upgraded-stack-and-volumes-destroyed');
  await dc(upgradedFile,['up','-d','--wait','db','teslamate-db']);
  await backup(upgradedFile,'upgraded-backup','restore');
  assert.deepEqual(await snapshot(upgradedFile,'after-restore'),baseline);
  await dc(upgradedFile,['up','-d','--no-deps','web']);
  await wait('restored web',async()=> (await fetch(`${base}/api/health`)).ok);
  await browser('restored');
  mark('upgraded-backup-restored-and-authenticated');
  await dc(upgradedFile,['stop','web']);
  await destroy(upgradedFile);
  activeModel=legacyFile;
  await dc(legacyFile,['up','-d','--wait','db','teslamate-db']);
  await backup(legacyFile,'pre-upgrade-backup','restore');
  assert.deepEqual(await snapshot(legacyFile,'after-rollback'),baseline);
  assert.equal(await sql(legacyFile,"select count(*) from information_schema.tables where table_name='location_provider_decisions';"),'0','Rollback restores old schema, not just old code');
  await dc(legacyFile,['up','-d','--no-deps','web','worker']);
  await wait('rollback web',async()=> (await fetch(`${base}/api/health`)).ok);
  await browser('rollback');
  mark('rollback-restores-original-runtime-schema-auth-and-exports');
  await run(process.execPath,[join(root,'acceptance/release-stack/verify-egress.mjs'),'--expect-zero',join(evidence,'current-egress.ndjson'),join(evidence,'browser-egress.ndjson')]);
  mark('zero-current-provider-egress');
  writeFileSync(join(evidence,'manifest.json'),JSON.stringify({status:'passed',issue:39,project,startedAt,finishedAt:new Date().toISOString(),commit,version,dirty,legacy:artifact,phases,
    execution:'local exact-source builds; published release digest acceptance remains the release gate',platform:process.platform,arch:process.arch},null,2));
  console.log(`PASS: ${evidence}/manifest.json`);
} catch(error) {
  writeFileSync(join(evidence,'manifest.json'),JSON.stringify({status:'failed',issue:39,project,startedAt,commit,version,error:error.message,phases},null,2));
  console.error(error.message); process.exitCode=1;
} finally {
  if(owned && activeModel) {
    const manifestPath=join(evidence,'manifest.json');
    const manifest=JSON.parse(readFileSync(manifestPath));
    try {
      await dc(activeModel,['logs','--no-color']);
      await dc(activeModel,['down','--volumes','--remove-orphans','--timeout','10']);
      for(const kind of ['ps','volume','network']) {
        const args=kind==='ps'?['ps','--all','--quiet']:[kind,'ls','--quiet'];
        assert.equal(await docker([...args,'--filter',`label=com.docker.compose.project=${project}`],{capture:true}),'','Owned disposable resources must be removed');
      }
      manifest.cleanup='passed';
    } catch(error) {
      console.error(`Cleanup failed: ${error.message}`);
      manifest.status='failed'; manifest.cleanup=error.message; process.exitCode=1;
    }
    writeFileSync(manifestPath,JSON.stringify(manifest,null,2));
  }
  closeSync(log);
}
