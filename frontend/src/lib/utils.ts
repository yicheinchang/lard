/**
 * Parses a contact string in the format "Name <email@address.com>" or just "email@address.com".
 * Handles quoted names like ""Doe, John" <email>".
 */
export function parseContact(contact: string | null): { name: string | null; email: string | null } {
  if (!contact || !contact.trim()) {
    return { name: null, email: null };
  }

  // Robust regex for RFC-like parsing:
  // Group 1: Quoted name
  // Group 2: Unquoted name
  // Group 3: Email (if name present)
  // Group 4: Email (if no name present)
  const regex = /(?:"([^"]+)"|([^<]+))\s*<([^>]+)>|^\s*([^<>\s]+@[^<>\s]+)\s*$/;
  const match = contact.match(regex);

  if (match) {
    const name = (match[1] || match[2])?.trim() || null;
    const email = (match[3] || match[4])?.trim() || null;
    return { name, email };
  }

  // Fallback for strings that don't match the pattern but might just be an email
  if (contact.includes('@')) {
    return { name: null, email: contact.trim() };
  }

  return { name: contact.trim(), email: null };
}
