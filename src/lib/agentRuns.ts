import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";

export type AgentRunType = "generateTools" | "generateNews" | "generatePrompts";

export type InsertAgentRunParams = {
  type: AgentRunType;
  input: Json;
  output: Json;
  success: boolean;
  error?: string | null;
  metadata?: Json | null;
};

export async function insertAgentRun(params: InsertAgentRunParams) {
  return supabase
    .from("agent_runs")
    .insert({
      type: params.type,
      input: params.input,
      output: params.output,
      success: params.success,
      error: params.error ?? null,
      metadata: params.metadata ?? null,
    })
    .select()
    .single();
}
