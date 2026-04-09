import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * Next.js API Proxy Route Handler
 * Proxies requests to the FastAPI backend defined by INTERNAL_BACKEND_URL.
 * Supports standard REST methods and Server-Sent Events (SSE) for streaming.
 */

const INTERNAL_BACKEND_URL = process.env.INTERNAL_BACKEND_URL || 'http://localhost:8000';

async function handleRequest(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path: pathSegments } = await params;
  const path = pathSegments.join('/');
  
  const url = new URL(req.url);
  const searchParams = url.searchParams.toString();
  const targetUrl = `${INTERNAL_BACKEND_URL}/${path}${searchParams ? `?${searchParams}` : ''}`;

  // Clone headers and set host for the backend
  const headers = new Headers(req.headers);
  headers.delete('host'); // Let fetch set the correct host header
  headers.set('X-Forwarded-For', req.ip || '127.0.0.1');

  try {
    const fetchOptions: RequestInit = {
      method: req.method,
      headers: headers,
      cache: 'no-store',
      // Provide body for mutations
      body: (req.method !== 'GET' && req.method !== 'HEAD') ? await req.blob() : undefined,
      signal: req.signal,
    };

    const response = await fetch(targetUrl, fetchOptions);

    // Identify if this is an SSE (Server-Sent Events) stream
    const contentType = response.headers.get('content-type');
    if (contentType?.includes('text/event-stream')) {
      const stream = new ReadableStream({
        async start(controller) {
          const reader = response.body?.getReader();
          if (!reader) {
            controller.close();
            return;
          }
          try {
            while (true) {
              const { value, done } = await reader.read();
              if (done) break;
              controller.enqueue(value);
            }
          } catch (err) {
            console.error('SSE Proxy Error:', err);
          } finally {
            controller.close();
          }
        },
      });

      return new NextResponse(stream, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache, no-transform',
          'Connection': 'keep-alive',
          'X-Accel-Buffering': 'no', // Crucial for proxying through Nginx/Vercel
        },
      });
    }

    // Standard JSON or Binary response
    const data = await response.blob();
    
    // Transfer relevant headers back to the client
    const responseHeaders = new Headers(response.headers);
    // Remove headers that might conflict
    responseHeaders.delete('content-encoding');
    responseHeaders.delete('content-length');

    return new NextResponse(data, {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
    });
  } catch (error: any) {
    console.error(`[NextProxy] Error (${req.method} /api/${path}):`, error);
    return NextResponse.json(
      { error: 'Backend Connection Failed', message: error.message }, 
      { status: 502 }
    );
  }
}

export const GET = handleRequest;
export const POST = handleRequest;
export const PUT = handleRequest;
export const DELETE = handleRequest;
export const PATCH = handleRequest;
