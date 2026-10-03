export const REPO_ROOT: string;
export function skillDir(): string;
export function requiredContexts(): Array<{ period: string; material: string; lighting: string; scene_type: string }>;
export function contextKey(c: { period: string; material: string; lighting: string; scene_type: string }): string;
export function emitContext(skill: string, ctx: { period: string; material: string; lighting: string; scene_type: string }, outFile: string): void;
export function emitAll(dir: string): string[];
