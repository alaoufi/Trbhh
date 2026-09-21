/** Never used by production. Browser fixture cannot access server settings/cookies. */
export async function cookies() { throw new Error('Server cookies are unavailable in the visual fixture.'); }
export async function getEmptyText() { throw new Error('Server settings are unavailable in the visual fixture.'); }
