export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

const clientId     = 'kxRIN9CvyY8ub4YzeGm0';
const clientSecret = 'w6YHANdpQD';
  if (!clientId || !clientSecret) return res.status(500).json({ error: 'Naver API key not configured' });

  const { keyword, pages = 1 } = req.body;
  if (!keyword) return res.status(400).json({ error: 'keyword required' });

  try {
    const allItems = [];
    const pageSize = 100; // 네이버 최대

    for (let page = 1; page <= Math.min(pages, 10); page++) {
      const start = (page - 1) * pageSize + 1;
      const url = `https://openapi.naver.com/v1/search/shop.json?query=${encodeURIComponent(keyword)}&display=${pageSize}&start=${start}&sort=sim`;

      const response = await fetch(url, {
        headers: {
          'X-Naver-Client-Id': clientId,
          'X-Naver-Client-Secret': clientSecret
        }
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        return res.status(response.status).json({ error: err?.errorMessage || 'Naver API error' });
      }

      const data = await response.json();
      if (data.items) allItems.push(...data.items);
    }

    // 상품명에서 HTML 태그 제거
    const titles = allItems.map(item => item.title.replace(/<[^>]+>/g, '').trim());
    return res.status(200).json({ titles });

  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
