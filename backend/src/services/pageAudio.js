export function buildPageAudioNarration(page, pageNumber) {
  const sections = (page.sections || [])
    .slice()
    .sort((a, b) => (a.position || 0) - (b.position || 0))
    .map((section) => (section?.text || "").trim())
    .filter(Boolean);

  const actionItem = (page.actionItem || "").trim();
  if (sections.length === 0 && !actionItem) {
    return "";
  }

  const pageTitle = (page.title || "").trim() || `Page ${pageNumber}`;
  const actionItemText = actionItem ? `Action item. ${actionItem}` : "";

  return `${pageTitle}. ${sections.join(" ")} ${actionItemText}`.replace(/\s+/g, " ").trim();
}

export function normalizeNarrationLanguage(language) {
  return language === "Hindi" ? "Hindi" : "English";
}