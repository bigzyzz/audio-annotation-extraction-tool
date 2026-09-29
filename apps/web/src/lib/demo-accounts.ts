/**
 * Demo personas for evaluation, presentations, and multi-user testing.
 * Provides pre-configured accounts (Alice and Bob) so evaluators can
 * immediately test real-time collaboration without typing credentials or
 * waiting for confirmation emails.
 */

export type DemoPersonaId = "alice" | "bob";

export type DemoPersona = {
  id: DemoPersonaId;
  name: string;
  role: string;
  username: string;
  email: string;
  password: string;
  description: string;
};

export const DEMO_PERSONAS: Record<DemoPersonaId, DemoPersona> = {
  alice: {
    id: "alice",
    name: "Alice",
    role: "Producer",
    username: "alice_producer",
    email: "alice@audiotool.test",
    password: "Password123!",
    description: "Uploads tracks and adds timestamped feedback markers",
  },
  bob: {
    id: "bob",
    name: "Bob",
    role: "Mix Engineer",
    username: "bob_engineer",
    email: "bob@audiotool.test",
    password: "Password123!",
    description: "Reviews feedback and collaborates on annotations in real-time",
  },
};

export function getDemoPersona(id: string): DemoPersona | undefined {
  if (id === "alice" || id === "bob") {
    return DEMO_PERSONAS[id];
  }
  return undefined;
}
