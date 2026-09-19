import assert from 'node:assert/strict';

const adLinks = 'a[href^="/ads/"]';
async function idsWithin(locator) {
  return locator.locator(adLinks).evaluateAll(links => [...new Set(links
    .map(link => new URL(link.href).pathname)
    .filter(path => /^\/ads\/\d+$/.test(path)))]);
}

/** Read-only guest acceptance: real dropdowns, all pages, filter propagation. */
export async function verifySandboxBrowse(page, base, expectedIds) {
  await page.goto(new URL('/', base).href);
  await page.getByLabel('القسم الرئيسي', {exact:true}).waitFor();
  assert.ok(await page.getByLabel('القسم الرئيسي', {exact:true}).locator('option').count() > 5);
  const feed = page.getByTestId('sandbox-public-feed');
  await feed.waitFor();
  const total = Number(await feed.getAttribute('data-total'));
  assert.ok(Number.isSafeInteger(total) && total > 0, 'Public snapshot must not be empty');
  const homeIds = [];
  const homePages = Math.ceil(total / 24);
  for (let number=1; number<=homePages; number++) {
    if (number > 1) await page.goto(new URL(`/?page=${number}`, base).href);
    const ids = await idsWithin(page.getByTestId('sandbox-public-feed'));
    assert.equal(ids.length, Math.min(24, total - (number - 1) * 24), `Home page ${number}`);
    homeIds.push(...ids);
    if (number < homePages) {
      const next = new URL(await page.getByTestId('sandbox-public-feed').getByLabel('التالي', {exact:true}).getAttribute('href'), base);
      assert.equal(next.searchParams.get('page'), String(number+1));
    }
  }
  assert.equal(new Set(homeIds).size, total, 'No missing or duplicate ads across home pages');
  const searchIds = [];
  for (let number=1; number<=Math.ceil(total/48); number++) {
    await page.goto(new URL(`/search?page=${number}`, base).href);
    await page.getByLabel('القسم الرئيسي', {exact:true}).waitFor();
    assert.match(await page.locator('body').innerText(), new RegExp(`النتائج: ${total}(?:\\D|$)`));
    const ids = await idsWithin(page.locator('main'));
    assert.equal(ids.length, Math.min(48, total - (number - 1) * 48), `Search page ${number}`);
    searchIds.push(...ids);
  }
  assert.deepEqual([...searchIds].sort(), [...homeIds].sort(), 'Home and search expose the same complete public snapshot');
  if (expectedIds) assert.deepEqual([...homeIds].sort(), expectedIds.map(id=>`/ads/${id}`).sort(), 'Every eligible snapshot ID is reachable');

  await page.getByLabel('القسم الرئيسي', {exact:true}).selectOption({label:'أخرى'});
  await page.getByLabel('القسم الفرعي', {exact:true}).selectOption({label:'أخرى'});
  // Submit the actual form, rather than guessing its button's styling/text.
  await page.getByLabel('القسم الرئيسي', {exact:true}).evaluate(select => select.form.requestSubmit());
  await page.waitForURL(url => url.pathname === '/search' && url.searchParams.get('category') === 'أخرى' && url.searchParams.get('subcategory') === 'أخرى');
  assert.equal(await page.getByLabel('القسم الرئيسي', {exact:true}).inputValue(), 'أخرى');
  assert.equal(await page.getByLabel('القسم الفرعي', {exact:true}).inputValue(), 'أخرى');
  const next = page.getByLabel('التالي', {exact:true});
  if (await next.count()) {
    const nextUrl = new URL(await next.getAttribute('href'), base);
    assert.equal(nextUrl.searchParams.get('category'), 'أخرى');
    assert.equal(nextUrl.searchParams.get('subcategory'), 'أخرى');
  }
  await page.getByLabel('القسم الرئيسي', {exact:true}).selectOption({label:'وظائف'});
  assert.equal(await page.getByLabel('القسم الفرعي', {exact:true}).inputValue(), '', 'Changing parent resets child');
  await page.getByLabel('القسم الرئيسي', {exact:true}).evaluate(select => select.form.requestSubmit());
  await page.waitForURL(url => url.searchParams.get('category') === 'وظائف');
  await page.getByRole('link', {name:'مسح الفلاتر', exact:true}).click();
  await page.waitForURL(url => url.pathname === '/search' && !url.search);
  assert.match(await page.locator('body').innerText(), new RegExp(`النتائج: ${total}(?:\\D|$)`));
  for (const path of ['/', '/search']) {
    await page.goto(new URL(`${path}?q=one&q=two&category=constructor&subcategory=toString&page=999999`,base).href);
    await page.getByLabel('القسم الرئيسي', {exact:true}).waitFor();
    assert.equal(await page.getByLabel('القسم الرئيسي', {exact:true}).inputValue(), '');
    assert.match(await page.locator('body').innerText(), new RegExp(`النتائج: ${total}(?:\\D|$)`));
  }
  await page.setViewportSize({width:390,height:844});
  await page.goto(new URL('/',base).href);
  await page.getByLabel('القسم الرئيسي', {exact:true}).waitFor();
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth), true, 'No mobile horizontal overflow');
  await page.setViewportSize({width:1280,height:900});
  console.log(`PASS: category/branch dropdowns, filter reset and pagination, all ${total} public ads reachable, mobile width.`);
}
