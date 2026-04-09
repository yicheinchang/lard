"use server";

import { revalidatePath } from 'next/cache';

/**
 * Next.js Server Actions
 * These functions run on the server and provide secure, typed access to the FastAPI backend.
 * Using Server Actions allows us to keep the backend isolated from the public internet.
 */

const INTERNAL_BACKEND_URL = process.env.INTERNAL_BACKEND_URL || 'http://localhost:8000';

async function callBackend(path: string, method: string, body?: any) {
  const url = `${INTERNAL_BACKEND_URL}/api/${path}`.replace(/\/+/g, '/').replace(':/', '://');
  
  const options: RequestInit = {
    method,
    headers: {
      'Content-Type': 'application/json',
    },
    cache: 'no-store',
  };

  if (body) {
    options.body = JSON.stringify(body);
  }

  try {
    const response = await fetch(url, options);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[ServerAction] Error ${method} ${path}:`, response.status, errorText);
      throw new Error(`Backend Error (${response.status}): ${errorText || response.statusText}`);
    }

    const data = await response.json();
    
    // Most mutations should trigger a cache invalidation for the main dashboard
    revalidatePath('/');
    
    return data;
  } catch (error: any) {
    console.error(`[ServerAction] Connection Failed ${method} ${path}:`, error.message);
    throw error;
  }
}

// ── Settings Actions ──────────────────────────────────────────────────

export async function updateSettingsAction(data: any) {
  return callBackend('settings', 'PUT', data);
}

export async function rebuildVectorsAction() {
  return callBackend('settings/rebuild-vectors', 'POST');
}

export async function testLlmAction(config: any) {
  return callBackend('settings/test-llm', 'POST', config);
}

export async function testEmbeddingAction(config: any) {
  return callBackend('settings/test-embedding', 'POST', config);
}

// ── Job Actions ───────────────────────────────────────────────────────

export async function updateJobAction(id: number, data: any) {
  return callBackend(`jobs/${id}`, 'PUT', data);
}

export async function deleteJobAction(id: number) {
  const result = await callBackend(`jobs/${id}`, 'DELETE');
  return result;
}

export async function checkDuplicateAction(data: any) {
  return callBackend('jobs/check-duplicate', 'POST', data);
}

// ── Step Actions ──────────────────────────────────────────────────────

export async function addStepAction(jobId: number, data: any) {
  return callBackend(`jobs/${jobId}/steps`, 'POST', data);
}

export async function updateStepAction(stepId: number, data: any) {
  return callBackend(`jobs/steps/${stepId}`, 'PUT', data);
}

export async function deleteStepAction(stepId: number) {
  return callBackend(`jobs/steps/${stepId}`, 'DELETE');
}

// ── Document Actions ──────────────────────────────────────────────────

export async function deleteDocumentAction(docId: number) {
  return callBackend(`documents/${docId}`, 'DELETE');
}

// ── AI Extraction Actions (Non-Streaming) ─────────────────────────────

export async function extractUrlAction(url: string) {
  return callBackend('ai/extract-url', 'POST', { url });
}

export async function extractTextAction(text: string) {
  return callBackend('ai/extract-text', 'POST', { text });
}
