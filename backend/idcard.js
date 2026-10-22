const T = require("./util");

// Port of campuskart.api.IdCard (the automatic ID-card reader/scorer).
const MIN_TEXT = 12;
const REASON_LIMIT = 100;
const SNIPPET_LIMIT = 400;

function squeeze(value) {
  let out = "";
  let space = false;
  for (let i = 0; i < value.length; i++) {
    const c = value[i];
    if (c === " ") {
      space = out.length > 0;
    } else {
      if (space) {
        out += " ";
        space = false;
      }
      out += c;
    }
  }
  return out;
}

function tidy(value) {
  const text = T.nz(value).replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines = text.split("\n");
  const kept = [];
  for (const raw of lines) {
    const line = raw.replace(/[ \t]+/g, " ").trim();
    if (line) kept.push(line);
  }
  return kept.join("\n");
}

function snippet(raw) {
  const flat = raw.replace(/\n/g, " ").replace(/[ ]+/g, " ").trim();
  return flat.length > SNIPPET_LIMIT ? flat.substring(0, SNIPPET_LIMIT - 3) + "..." : flat;
}

function plain(value) {
  const up = T.upper(value);
  let out = "";
  for (const c of up) out += (c >= "A" && c <= "Z") || (c >= "0" && c <= "9") ? c : " ";
  return squeeze(out);
}

function glued(value) {
  return plain(value).replace(/ /g, "");
}

function digits(value) {
  const up = T.upper(value);
  let out = "";
  for (const c of up) {
    if (c >= "0" && c <= "9") out += c;
    else if (c === "O" || c === "Q" || c === "D") out += "0";
    else if (c === "I" || c === "L") out += "1";
    else if (c === "Z") out += "2";
    else if (c === "S") out += "5";
    else if (c === "G") out += "6";
    else if (c === "B") out += "8";
  }
  return out;
}

function letter(digit) {
  if (digit === "0") return "O";
  if (digit === "1") return "I";
  if (digit === "2") return "Z";
  if (digit === "5") return "S";
  if (digit === "6") return "G";
  if (digit === "8") return "B";
  return " ";
}

function letters(value) {
  const up = T.upper(value);
  let out = "";
  for (const c of up) {
    if (c >= "A" && c <= "Z") out += c;
    else if (c >= "0" && c <= "9") out += letter(c);
    else out += " ";
  }
  return squeeze(out);
}

function distance(left, right) {
  let previous = [];
  let current = [];
  for (let j = 0; j <= right.length; j++) previous[j] = j;
  for (let i = 1; i <= left.length; i++) {
    current[0] = i;
    for (let j = 1; j <= right.length; j++) {
      const cost = left[i - 1] === right[j - 1] ? 0 : 1;
      const del = previous[j] + 1;
      const ins = current[j - 1] + 1;
      const chg = previous[j - 1] + cost;
      current[j] = Math.min(del, Math.min(ins, chg));
    }
    previous = current.slice();
  }
  return previous[right.length];
}

function index(words, want) {
  for (let i = 0; i < words.length; i++) {
    if (words[i] === want) return i;
  }
  const slack = want.length >= 9 ? 2 : want.length >= 5 ? 1 : 0;
  if (slack === 0) return -1;
  let best = -1;
  let bestDistance = slack + 1;
  for (let i = 0; i < words.length; i++) {
    const have = words[i];
    if (Math.abs(have.length - want.length) > slack) continue;
    const d = distance(want, have);
    if (d < bestDistance) {
      bestDistance = d;
      best = i;
    }
  }
  return bestDistance <= slack ? best : -1;
}

function inCardOrder(found, at) {
  let name = "";
  const used = found.map(() => false);
  for (let n = 0; n < found.length; n++) {
    let pick = -1;
    for (let i = 0; i < found.length; i++) {
      if (!used[i] && (pick < 0 || at[i] < at[pick])) pick = i;
    }
    used[pick] = true;
    if (name.length > 0) name += " ";
    name += found[pick];
  }
  return name;
}

function readName(passes, typedName) {
  const want = letters(typedName);
  if (!want) return "";
  const wanted = want.split(" ");
  for (const pass of passes) {
    const have = letters(pass);
    if (!have) continue;
    const words = have.split(" ");
    const found = [];
    const at = [];
    let all = true;
    for (const w of wanted) {
      const hit = index(words, w);
      if (hit < 0) {
        all = false;
        break;
      }
      found.push(words[hit]);
      at.push(hit);
    }
    if (all) return inCardOrder(found, at);
  }
  return "";
}

function idFound(passes, typedId) {
  const want = glued(typedId);
  if (!want) return false;
  const wantDigits = digits(typedId);
  for (const pass of passes) {
    if (glued(pass).includes(want)) return true;
    if (wantDigits.length >= 4 && digits(pass).includes(wantDigits)) return true;
  }
  return false;
}

function passes(raw) {
  const lines = raw.split("\n");
  return lines.concat([lines.join(" ")]);
}

function check(cardText, typedName, collegeId) {
  const matched = [];
  const problems = [];
  const reasons = [];
  const raw = tidy(cardText);
  const shown = snippet(raw);
  if (!raw) {
    problems.push("The photo of your ID card could not be read. Upload a brighter, closer photo showing the name and the college ID.");
    reasons.push("The ID card could not be read automatically; an admin must check it by hand.");
    return result(shown, "", matched, problems, reasons, false);
  }
  if (glued(raw).length < MIN_TEXT) {
    problems.push("Only a few characters could be read from the ID card. Upload a brighter, closer photo showing the name and the college ID.");
    reasons.push("The ID card was too faint to read automatically; an admin must check it by hand.");
    return result(shown, "", matched, problems, reasons, false);
  }
  const list = passes(raw);
  const nameOnCard = readName(list, typedName);
  if (!nameOnCard) {
    problems.push(`The name on the card does not match "${T.upper(T.trim(typedName))}". Type your name exactly as it is printed, or upload a clearer photo.`);
    reasons.push("The name read from the card did not match the typed name.");
  } else {
    matched.push("name on the card");
  }
  if (!idFound(list, collegeId)) {
    problems.push(`The college ID / PRN "${T.trim(collegeId)}" was not found on the card. Check the number, or upload a photo where it is clearly visible.`);
    reasons.push("The college ID / PRN was not found on the card.");
  } else {
    matched.push("college ID / PRN on the card");
  }
  const ok = problems.length === 0;
  return result(shown, nameOnCard, matched, problems, reasons, ok);
}

function result(readText, nameOnCard, matched, problems, reasons, verified) {
  return {
    readText,
    nameOnCard,
    matched,
    problems,
    verified,
    reason() {
      if (verified) return null;
      const joined = reasons.join(" ").trim();
      if (!joined) return "An admin must check this ID card by hand.";
      return joined.length > REASON_LIMIT ? joined.substring(0, REASON_LIMIT - 3) + "..." : joined;
    },
  };
}

module.exports = { check };
