import { NextResponse } from "next/server";

export function GET() {
  const encoded = process.env.TESLA_PUBLIC_KEY_PEM_BASE64?.trim();
  if (!encoded) return new NextResponse("Not configured\n", { status: 404 });
  try {
    const pem = Buffer.from(encoded, "base64").toString("utf8");
    if (!pem.includes("BEGIN PUBLIC KEY") || !pem.includes("END PUBLIC KEY")) {
      return new NextResponse("Invalid public key configuration\n", { status: 500 });
    }
    return new NextResponse(pem.endsWith("\n") ? pem : `${pem}\n`, {
      headers: {
        "content-type": "application/x-pem-file",
        "cache-control": "public, max-age=300",
      },
    });
  } catch {
    return new NextResponse("Invalid public key configuration\n", { status: 500 });
  }
}
