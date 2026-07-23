export interface Track {
  rel: string;
  folder: string;
  platforms: string[];
  dur: number | null;
}

export interface QuickDir {
  label: string;
  dir: string;
}

export interface SubDir {
  name: string;
  mp4s: number;
}

export interface AppState {
  videos: string[];
  tracks: Track[];
  rendered: Record<string, string[]>;
  platforms: string[];
  video_dir: string;
  parent: string;
  subdirs: SubDir[];
  overlays: string[];
  next_number: number;
  name_prefix: string;
  stars: string[];
  quick_dirs: QuickDir[];
  vdurs: Record<string, number | null>;
}

export interface ExportItem {
  name: string;
  platforms: string[];
  mtime: number;
  source: string | null;
}

export interface Captions {
  titles: Record<string, string>;
  yt_description: string;
  instagram: string;
  tiktok: string;
}

export interface RenderResult {
  results: Record<string, { ok: boolean; out?: string; error?: string }>;
  moved: string | null;
}

export interface Progress {
  active: boolean;
  label: string;
  pct: number;
}

async function json<T>(r: Response): Promise<T> {
  return (await r.json()) as T;
}

export const api = {
  list: () => fetch("/api/list").then((r) => json<AppState>(r)),
  progress: () => fetch("/api/progress").then((r) => json<Progress>(r)),
  post: <T,>(url: string, body: unknown) =>
    fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).then((r) => json<T>(r)),
};

export function fmtDur(d: number | null | undefined): string {
  if (d == null) return "";
  const s = Math.round(d);
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export function encPath(rel: string): string {
  return rel.split("/").map(encodeURIComponent).join("/");
}
