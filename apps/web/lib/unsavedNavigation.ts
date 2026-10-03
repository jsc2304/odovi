/** Runs before hydration so Next cannot process a cancelled traversal first. */
export const UNSAVED_NAVIGATION_GUARD = `(() => {
  const key = "odoviHistoryPosition";
  let position = history.state?.[key] ?? 0;
  let restoring = false;
  const push = history.pushState.bind(history);
  const replace = history.replaceState.bind(history);
  replace({ ...history.state, [key]: position }, "");
  history.pushState = (data, unused, url) => {
    const next = position + 1;
    push({ ...data, [key]: next }, unused, url);
    position = next;
  };
  history.replaceState = (data, unused, url) => {
    replace({ ...data, [key]: position }, unused, url);
  };
  window.addEventListener("popstate", event => {
    const next = event.state?.[key];
    if (restoring) {
      event.stopImmediatePropagation();
      if (typeof next === "number" && next !== position) history.go(position - next);
      else restoring = false;
      return;
    }
    if (typeof next !== "number") return;
    const form = document.querySelector('form[data-unsaved="true"]');
    if (form && !window.confirm(form.dataset.unsavedMessage)) {
      event.stopImmediatePropagation();
      restoring = true;
      history.go(position - next);
    } else position = next;
  }, true);
})();`;
