export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const PLACES_KEY = process.env.GOOGLE_PLACES_API_KEY;
  const SEARCH_KEY = process.env.GOOGLE_SEARCH_API_KEY;
  const SEARCH_CX  = process.env.GOOGLE_SEARCH_CX;

  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'name required' });

  // ── 010 번호 추출 헬퍼 ──────────────────────────────
  function extract010(text) {
    const matches = text.match(/010[-.\s]?\d{3,4}[-.\s]?\d{4}/g) || [];
    const seen = new Set();
    return matches
      .map(n => {
        const digits = n.replace(/[-.\s]/g, '');
        return digits.replace(/^(\d{3})(\d{3,4})(\d{4})$/, '$1-$2-$3');
      })
      .filter(n => {
        if (seen.has(n)) return false;
        seen.add(n);
        return true;
      });
  }

  const result = {
    query: name,
    places: [],
    phones: [],
    source: null
  };

  // ── 1단계: Places API ────────────────────────────────
  if (PLACES_KEY) {
    try {
      const r = await fetch('https://places.googleapis.com/v1/places:searchText', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': PLACES_KEY,
          'X-Goog-FieldMask': 'places.displayName,places.formattedAddress,places.nationalPhoneNumber,places.internationalPhoneNumber,places.websiteUri'
        },
        body: JSON.stringify({
          textQuery: name,
          languageCode: 'ko',
          regionCode: 'KR',
          maxResultCount: 5
        })
      });
      const data = await r.json();
      result.places = (data.places || []).map(p => ({
        bizName: p.displayName?.text || '',
        address: p.formattedAddress || '',
        phone: p.nationalPhoneNumber || p.internationalPhoneNumber || '',
        website: p.websiteUri || '',
        is010: /^010/.test((p.nationalPhoneNumber || '').replace(/[-\s]/g, ''))
      }));

      const nums010 = result.places
        .filter(p => p.is010)
        .map(p => ({ number: p.phone, source: 'places', bizName: p.bizName, address: p.address }));

      if (nums010.length) {
        result.phones = nums010;
        result.source = 'places';
        return res.status(200).json(result);
      }
    } catch (e) {
      result.placesError = e.message;
    }
  }

  // ── 2단계: Google Custom Search API 폴백 ─────────────
  if (SEARCH_KEY && SEARCH_CX) {
    try {
      const queries = [
        `"${name}" 010`,
        `"${name}" 연락처 휴대폰`,
        `"${name}" 대표번호 010`
      ];

      const allNums = [];
      for (const q of queries) {
        const url = `https://www.googleapis.com/customsearch/v1?key=${SEARCH_KEY}&cx=${SEARCH_CX}&q=${encodeURIComponent(q)}&num=5&gl=kr&hl=ko`;
        const r = await fetch(url);
        if (!r.ok) continue;
        const data = await r.json();
        for (const item of (data.items || [])) {
          const text = [item.title, item.snippet, item.htmlSnippet].join(' ');
          const nums = extract010(text);
          for (const n of nums) {
            if (!allNums.find(x => x.number === n)) {
              allNums.push({
                number: n,
                source: 'search',
                snippet: item.snippet?.slice(0, 80) || '',
                link: item.link || ''
              });
            }
          }
        }
        if (allNums.length >= 3) break;
      }

      if (allNums.length) {
        result.phones = allNums;
        result.source = 'search';
        return res.status(200).json(result);
      }
    } catch (e) {
      result.searchError = e.message;
    }
  }

  result.source = 'none';
  return res.status(200).json(result);
}
