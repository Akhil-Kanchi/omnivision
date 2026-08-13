import { getIdToken } from './firebase';

const apiBase = () => (import.meta.env.VITE_OHMLET_API_BASE_URL || 'http://localhost:8082').replace(/\/+$/, '');

async function authHeaders(): Promise<Record<string, string>> {
  const token = await getIdToken();
  const localToken = import.meta.env.VITE_LOCAL_TUTOR === 'true' ? 'local-dev-token' : null;
  return { Authorization: `Bearer ${token || localToken || ''}` };
}

export type ProcedureStep = {
  id: number;
  action: string;
  instruction: string;
  required_objects: string[];
  expected_state: string;
};

export type VerificationResult = {
  status: 'verified' | 'incomplete' | 'incorrect' | 'unclear' | 'unsafe';
  expected_step: number;
  observed_action: string;
  observed_state: string;
  evidence: string[];
  missing: string[];
  next_instruction: string;
  confidence: number;
};

export async function getAssemblyProcedure(productId: string, action: string): Promise<ProcedureStep[]> {
  const response = await fetch(`${apiBase()}/v1/procedures/${encodeURIComponent(productId)}/${encodeURIComponent(action)}`);
  if (!response.ok) throw new Error('Could not load the procedure.');
  const payload = await response.json() as { steps: ProcedureStep[] };
  return payload.steps;
}

export async function verifyAssemblyAction(args: {
  frame: string;
  productId: string;
  product: string;
  action: string;
  stepId: number;
  previousState?: string;
}): Promise<VerificationResult> {
  const response = await fetch(`${apiBase()}/v1/verify-action`, {
    method: 'POST',
    headers: { ...(await authHeaders()), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      frame: args.frame,
      product_id: args.productId,
      product: args.product,
      action: args.action,
      step_id: args.stepId,
      previous_state: args.previousState,
    }),
  });
  if (!response.ok) throw new Error('Visual verification failed. Try a clearer camera angle.');
  return response.json() as Promise<VerificationResult>;
}
