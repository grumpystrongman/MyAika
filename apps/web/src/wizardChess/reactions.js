import { summarizeWizardHabits } from "./memory.js";

const MODE_LINES = {
  playful_rival: {
    game_start: ["Let's make this interesting.", "Board's hot. Your move.", "Try not to blunder in style."],
    opening_detected: ["{opening} again? Predictable. Dangerous, though.", "Ah, {opening}. You came prepared.", "That opening has your fingerprints all over it."],
    move_made: ["Bold.", "You are baiting me.", "Not bad. Not safe, but not bad."],
    illegal_move_attempt: ["Nice spell. Illegal, though.", "That move bends reality. Try another.", "You can't cheat the board that openly."],
    capture: ["Clean hit.", "You just made this personal.", "Pieces are flying now."],
    check: ["Careful. Your king looks nervous.", "Check. Try breathing.", "Your throne is shaking."],
    blunder: ["That one leaked danger.", "I was hoping you'd do that.", "You just gave me a doorway."],
    brilliant_move: ["Alright, I respect that move.", "That was cleaner than I wanted.", "You actually surprised me."],
    promotion: ["A pawn ascends. Dramatic.", "Promotion online. Trouble rising.", "And now the board mutates."],
    checkmate: ["Checkmate. Take a bow.", "And that is the final spell.", "Mate. Well played."],
    rematch: ["Again. Good.", "Run it back.", "Another duel then."],
    resignation: ["You resigned with dignity.", "Retreat accepted. We'll do this again.", "I will remember this surrender."]
  },
  sorceress: {
    game_start: ["The runes are awake.", "Come then. Let the board decide.", "Your will versus mine."],
    opening_detected: ["{opening}. A familiar incantation.", "You invoke {opening}. Elegant.", "Ah, {opening}. You favor old magic."],
    move_made: ["A deliberate gesture.", "Interesting line.", "You place your intent well."],
    illegal_move_attempt: ["Even magic has rules.", "That line is sealed.", "The board rejects that spell."],
    capture: ["A clean strike.", "Your piece drinks momentum.", "Steel and spark."],
    check: ["Check.", "Your king stands in shadow.", "One step from ruin."],
    blunder: ["A crack in your formation.", "You opened a dangerous seam.", "That weakness glows."],
    brilliant_move: ["Beautifully timed.", "That was elegant.", "Sharp and precise."],
    promotion: ["A humble piece transcends.", "Promotion. New power rises.", "The pawn is reborn."],
    checkmate: ["Checkmate. The ritual closes.", "This duel is mine.", "Your king yields."],
    rematch: ["Very well. Another rite.", "Again, then.", "Reset the board."],
    resignation: ["A wise surrender.", "You bow before the inevitable.", "You step away. For now."]
  },
  coach: {
    game_start: ["Good luck. Focus on king safety and piece activity.", "Let's play a clean game.", "You can win this with discipline."],
    opening_detected: ["{opening} detected. Watch your development timing.", "{opening} on board. Track pawn breaks.", "You entered {opening}. Keep your center stable."],
    move_made: ["Solid move.", "Reasonable idea.", "Keep coordinating your pieces."],
    illegal_move_attempt: ["Illegal move. Try a legal square from that piece.", "That move is not legal in this position.", "Board says no on that move."],
    capture: ["Good conversion.", "Nice tactical pickup.", "Material swing noted."],
    check: ["Check on board. Calculate forcing lines first.", "King safety alert.", "Check. Verify your escape squares."],
    blunder: ["That dropped tactical safety.", "Watch hanging pieces here.", "This move gives your opponent a tactical target."],
    brilliant_move: ["Excellent tactical idea.", "Great resource. Keep that pattern.", "Strong move. Nice calculation."],
    promotion: ["Promotion achieved. Convert carefully.", "Great. Promotion changes the evaluation a lot.", "Promotion online. Prioritize king safety."],
    checkmate: ["Checkmate reached. Nice finish.", "Game over by mate.", "Mate on the board."],
    rematch: ["Let's run another with one improvement goal.", "Rematch ready.", "New game. Same focus: clean calculation."],
    resignation: ["Resignation noted. We can review critical moments next.", "You resigned. Let's analyze the turning point.", "Game ended by resignation."]
  },
  dark_narrator: {
    game_start: ["The chamber falls silent.", "Another duel beneath cold stars.", "Two kings. One ending."],
    opening_detected: ["{opening} emerges from the fog.", "The old line of {opening} returns.", "{opening}. Fate has seen this path."],
    move_made: ["The board remembers.", "A piece drifts into omen.", "The pattern tightens."],
    illegal_move_attempt: ["That path is forbidden.", "The square rejects your will.", "The spell collapses."],
    capture: ["A piece shatters to dust.", "The clash rings in stone.", "Another soul leaves the board."],
    check: ["Check. The crown trembles.", "The king is hunted.", "Shadows close around the throne."],
    blunder: ["A fatal seam opens.", "That mistake will echo.", "You fed the dark line."],
    brilliant_move: ["A rare, bright strike.", "You carved through the darkness.", "That move sang."],
    promotion: ["A pawn ascends into legend.", "Transfiguration complete.", "Power is reborn."],
    checkmate: ["Checkmate. Silence.", "The throne falls.", "And so the tale ends."],
    rematch: ["The candles relight.", "One more descent.", "The board hungers again."],
    resignation: ["You lower your standard.", "Retreat writes its own history.", "The duel ends without the final blow."]
  }
};

function uniqueLine(lines = [], recent = []) {
  const filtered = lines.filter(Boolean);
  if (!filtered.length) return "";
  const normalizedRecent = new Set((recent || []).map(item => String(item || "").toLowerCase()));
  const candidates = filtered.filter(line => !normalizedRecent.has(String(line).toLowerCase()));
  const pool = candidates.length ? candidates : filtered;
  return pool[Math.floor(Math.random() * pool.length)];
}

function fillTemplate(text = "", context = {}) {
  return String(text || "")
    .replace(/\{opening\}/g, context.opening || "that line")
    .replace(/\{favoritePiece\}/g, context.favoritePieceLabel || "pieces");
}

export function maybeMemoryHint(memory = {}, eventType = "") {
  const habits = summarizeWizardHabits(memory);
  if (!habits.gamesPlayed || habits.gamesPlayed < 2) return "";
  if (eventType === "opening_detected" && habits.favoriteOpening) {
    return `You keep returning to ${habits.favoriteOpening}.`;
  }
  if (eventType === "capture" && habits.aggressionRatio > 0.55) {
    return "You always get dangerous when the board opens.";
  }
  if (eventType === "move_made" && habits.favoritePiece === "n") {
    return "Your knights keep waking up early.";
  }
  return "";
}

export function buildWizardReaction({
  mode = "playful_rival",
  eventType = "move_made",
  context = {},
  recentLines = [],
  memory = {}
} = {}) {
  const voice = MODE_LINES[mode] || MODE_LINES.playful_rival;
  const lines = voice[eventType] || voice.move_made || [];
  const pick = uniqueLine(lines, recentLines);
  const rendered = fillTemplate(pick, context);
  const memoryHint = maybeMemoryHint(memory, eventType);
  const message = memoryHint && Math.random() < 0.28 ? `${rendered} ${memoryHint}`.trim() : rendered;
  const moodByEvent = {
    game_start: "amused",
    opening_detected: "curious",
    move_made: "focused",
    illegal_move_attempt: "smug",
    capture: "charged",
    check: "tense",
    blunder: "smug",
    brilliant_move: "impressed",
    promotion: "charged",
    checkmate: "triumphant",
    rematch: "amused",
    resignation: "calm"
  };
  return {
    text: message || "Your move.",
    mood: moodByEvent[eventType] || "focused"
  };
}
