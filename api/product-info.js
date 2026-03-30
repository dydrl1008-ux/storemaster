export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { query } = req.query;
  if (!query) return res.status(400).json({ error: 'query 파라미터 필요' });

  const clientId = process.env.NAVER_CLIENT_ID;
  const clientSecret = process.env.NAVER_CLIENT_SECRET;
  if (!clientId || !clientSecret) return res.status(500).json({ error: 'API 키 미설정' });

  try {
    const searchUrl = `https://openapi.naver.com/v1/search/shop.json?query=${encodeURIComponent(query)}&display=20&sort=sim`;

    const response = await fetch(searchUrl, {
      headers: {
        'X-Naver-Client-Id': clientId,
        'X-Naver-Client-Secret': clientSecret,
      }
    });

    if (!response.ok) {
      return res.status(502).json({ error: `네이버 API 오류: ${response.status}` });
    }

    const data = await response.json();
    const items = data.items || [];

    if (!items.length) {
      return res.status(200).json({ error: '검색 결과 없음' });
    }

    // 상품명 HTML 태그 제거 함수
    const clean = str => str.replace(/<[^>]+>/g, '').trim();

    // 1순위: 상품명 완전 일치
    const normalize = str => clean(str).replace(/\s+/g, ' ').toLowerCase();
    const queryNorm = normalize(query);

    let matched = items.find(item => normalize(item.title) === queryNorm);

    // 2순위: 상품명 포함
    if (!matched) {
      matched = items.find(item => normalize(item.title).includes(queryNorm));
    }

    // 3순위: 첫 번째 결과
    if (!matched) {
      matched = items[0];
    }

    const result = {
      productName: clean(matched.title),
      price: matched.lprice ? Number(matched.lprice).toLocaleString() + '원' : null,
      brand: matched.brand || null,
      maker: matched.maker || null,
      mall: matched.mallName || null,
      category: [
        matched.category1,
        matched.category2,
        matched.category3,
        matched.category4,
      ].filter(Boolean),
      link: matched.link || null,
      image: matched.image || null,
      matchedTitle: clean(matched.title),
    };

    return res.status(200).json(result);

  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
