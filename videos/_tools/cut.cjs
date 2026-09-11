// Cuts raw footage into the edit described by videos/<name>/edit.json.
//
// Segments that follow on from each other in the source are concatenated (a speed change
// is not a visible cut); a jump in the source becomes a short crossfade. Caption times are
// written against SOURCE seconds (the marks) and remapped here onto the edited timeline.
//
//   node videos/_tools/cut.cjs <name>      -> assets/edited.mp4 + timeline.json
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const name = process.argv[2];
const dir = path.join(__dirname, "..", name);
const edl = JSON.parse(fs.readFileSync(path.join(dir, "edit.json"), "utf8"));
const src = path.join(dir, "assets", "footage.mp4");
const FADE = 0.45;

// Group segments into shots: contiguous source ranges share a shot.
const shots = [];
for (const seg of edl.segments) {
  const [from, to, speed = 1] = seg;
  const last = shots[shots.length - 1];
  const piece = { from, to, speed, dur: (to - from) / speed };
  if (last && Math.abs(last.pieces[last.pieces.length - 1].to - from) < 0.05) last.pieces.push(piece);
  else shots.push({ pieces: [piece] });
}

// Edited start time of every piece, accounting for crossfade overlap between shots.
let t = 0;
shots.forEach((shot, i) => {
  if (i > 0) t -= FADE;
  shot.start = t;
  for (const p of shot.pieces) {
    p.editStart = t;
    t += p.dur;
  }
  shot.dur = shot.pieces.reduce((a, p) => a + p.dur, 0);
});
const total = t;

const toEdit = (s) => {
  for (const shot of shots) for (const p of shot.pieces) if (s >= p.from - 1e-3 && s <= p.to + 1e-3) return p.editStart + (s - p.from) / p.speed;
  throw new Error(`source time ${s} is not inside any segment`);
};

// Filter graph: trim + retime each piece, concat within a shot, xfade across shots.
const parts = [];
let n = 0;
const shotLabels = shots.map((shot, si) => {
  const labels = shot.pieces.map((p) => {
    const l = `p${n++}`;
    parts.push(`[0:v]trim=start=${p.from}:end=${p.to},setpts=(PTS-STARTPTS)/${p.speed},fps=30,settb=1/30[${l}]`);
    return `[${l}]`;
  });
  if (labels.length === 1) return labels[0];
  parts.push(`${labels.join("")}concat=n=${labels.length}:v=1:a=0,fps=30,settb=1/30[s${si}]`);
  return `[s${si}]`;
});
let acc = shotLabels[0];
let offset = shots[0].dur;
for (let i = 1; i < shots.length; i++) {
  const out = `[x${i}]`;
  parts.push(`${acc}${shotLabels[i]}xfade=transition=fade:duration=${FADE}:offset=${(offset - FADE).toFixed(3)}${out}`);
  acc = out;
  offset += shots[i].dur - FADE;
}
parts.push(`${acc}fps=30,format=yuv420p[vout]`);

const out = path.join(dir, "assets", "edited.mp4");
execFileSync(process.env.FFMPEG, ["-hide_banner", "-v", "error", "-y", "-i", src, "-filter_complex", parts.join(";"), "-map", "[vout]",
  "-c:v", "libx264", "-preset", "slow", "-crf", "16", "-movflags", "+faststart", out], { stdio: "inherit" });

const captions = (edl.captions || []).map((c) => {
  const start = +toEdit(c.at).toFixed(2);
  const end = +(c.until !== undefined ? toEdit(c.until) : start + c.hold).toFixed(2);
  return { ...c, start, end };
});
fs.writeFileSync(path.join(dir, "timeline.json"), JSON.stringify({ footageDuration: +total.toFixed(2), captions }, null, 2));
console.log(`${name}: edited ${total.toFixed(2)}s from ${shots.length} shots, ${captions.length} captions`);
for (const c of captions) console.log(`  ${c.start.toFixed(2)}-${c.end.toFixed(2)}  ${c.title}`);
