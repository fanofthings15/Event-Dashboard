// Matches a saved favorite team name against an event's team list (or its
// combined name, for sources without a teams array), case-insensitively.
// Mirrors frontend/src/useEvents.ts's withFavoriteTeams so both sides agree
// on what counts as "followed."
export function matchesFavoriteTeam(
  event: { name: string; followed?: boolean; teams?: { name: string }[] },
  favoriteTeams: string[]
): boolean {
  if (event.followed) return true;
  if (favoriteTeams.length === 0) return false;
  const haystacks = event.teams?.length ? event.teams.map((t) => t.name.toLowerCase()) : [event.name.toLowerCase()];
  return favoriteTeams.some((team) => {
    const t = team.trim().toLowerCase();
    return t && haystacks.some((h) => h.includes(t));
  });
}
