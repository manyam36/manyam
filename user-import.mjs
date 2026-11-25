// Pure spreadsheet validation. Passwords are never included in errors or previews.
export function prepareUserImport(matrix, defaults, schools, existingEmails = []) {
  if (matrix.length < 2) throw new Error("The first sheet must contain headings and at least one account.");
  const aliases = { emails: "email", passwords: "password", name: "displayName", fullname: "displayName" };
  const headers = matrix[0].map(value => {
    const key = String(value ?? "").trim().toLowerCase().replace(/[ _-]/g, "");
    return aliases[key] || ({ displayname: "displayName", schooludise: "schoolUdise" }[key]) || key;
  });
  if (!headers.includes("email") || !headers.includes("password")) throw new Error("Required columns: email and password.");
  if (new Set(headers.filter(Boolean)).size !== headers.filter(Boolean).length) throw new Error("Duplicate column headings are not allowed.");
  const entries = matrix.slice(1).map((cells, index) => ({ cells, row: index + 2 }))
    .filter(({ cells }) => cells.some(value => String(value ?? "").trim()));
  if (!entries.length || entries.length > 200) throw new Error("Upload between 1 and 200 accounts at a time.");
  const seen = new Set();
  const registered = new Set(existingEmails.map(email => String(email).toLowerCase()));
  const errors = [];
  const users = entries.map(({ cells, row }) => {
    const raw = Object.fromEntries(headers.map((key, i) => [key, cells[i] ?? ""]));
    const email = String(raw.email).trim().toLowerCase();
    const password = String(raw.password); // Preserve spaces and leading zeroes in text cells.
    const role = String(raw.role || defaults.role || "").trim().toUpperCase();
    const schoolUdise = String(raw.schoolUdise || defaults.schoolUdise || "").trim();
    const school = schools.find(s => String(s.udise) === schoolUdise);
    const mandal = String(raw.mandal || (role !== "MEO" ? school?.mandal : defaults.mandal) || "").trim().toUpperCase();
    const displayName = String(raw.displayName || email.split("@")[0]).trim();
    const issues = [];
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) issues.push("invalid email");
    if (password.length < 8 || password.length > 128) issues.push("password must have 8–128 characters");
    if (typeof raw.password !== "string") issues.push("format the password cell as Text in Excel");
    if (seen.has(email)) issues.push("duplicate email in spreadsheet");
    if (registered.has(email)) issues.push("email already has a staff profile");
    if (!["MEO", "PD", "PET"].includes(role)) issues.push("role must be MEO, PD or PET");
    if (!schools.some(s => s.mandal === mandal)) issues.push("select a valid mandal");
    if (role !== "MEO" && (!school || school.mandal !== mandal)) issues.push("school must belong to the assigned mandal");
    if (!displayName || displayName.length > 100) issues.push("name must have 1–100 characters");
    seen.add(email);
    if (issues.length) errors.push(`Row ${row}: ${issues.join("; ")}.`);
    return { row, email, password, displayName, role, mandal, schoolUdise: role === "MEO" ? "ALL" : schoolUdise };
  });
  return { users, errors };
}
