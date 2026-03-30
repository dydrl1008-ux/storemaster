export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { url } = req.query;
  if (!url) return res.status(400).json({ error: 'url 파라미터 필요' });

  try {
    const decoded = decodeURIComponent(url);

    const response = await fetch(decoded, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'ko-KR,ko;q=0.9',
        'Referer': 'https://search.shopping.naver.com/',
      },
    });

    if (!response.ok) {
      return res.status(502).json({ error: `페이지 응답 오류: ${response.status}` });
    }

    const html = await response.text();

    const result = {
      productName: null,
      price: null,
      category: [],
      attributes: {},  // 종류, 특징, 주요제품특징 등
      tags: [],
      brand: null,
      maker: null,
      mall: null,
    };

    // 상품명
    const nameMatch = html.match(/<h1[^>]*class="[^"]*product_title[^"]*"[^>]*>([\s\S]*?)<\/h1>/i)
      || html.match(/<title>(.*?)(?:\s*[:\|].*)?<\/title>/i);
    if (nameMatch) {
      result.productName = nameMatch[1].replace(/<[^>]+>/g, '').trim();
    }

    // 가격
    const priceMatch = html.match(/class="[^"]*price_num[^"]*"[^>]*>([\d,]+)/);
    if (priceMatch) result.price = priceMatch[1] + '원';

    // 카테고리 (breadcrumb)
    const catMatches = [...html.matchAll(/class="[^"]*breadcrumb[^"]*"[\s\S]*?<\/[^>]+>/gi)];
    const catText = catMatches.map(m => m[0].replace(/<[^>]+>/g, ' ').trim()).join(' ');
    if (catText) {
      result.category = catText.split(/[>\|\/]/).map(s => s.trim()).filter(s => s.length > 0 && s.length < 20);
    }

    // 속성 파싱 (dl > dt + dd 패턴 — 네이버 쇼핑 속성 영역)
    const attrSectionMatch = html.match(/<dl[^>]*class="[^"]*spec[^"]*"[^>]*>([\s\S]*?)<\/dl>/gi)
      || html.match(/<dl[^>]*>([\s\S]*?)<\/dl>/gi);

    if (attrSectionMatch) {
      for (const section of attrSectionMatch) {
        const dtMatches = [...section.matchAll(/<dt[^>]*>([\s\S]*?)<\/dt>/gi)];
        const ddMatches = [...section.matchAll(/<dd[^>]*>([\s\S]*?)<\/dd>/gi)];
        dtMatches.forEach((dt, i) => {
          const key = dt[1].replace(/<[^>]+>/g, '').trim();
          const val = ddMatches[i] ? ddMatches[i][1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim() : '';
          if (key && val && key.length < 20) {
            result.attributes[key] = val;
          }
        });
      }
    }

    // 태그 (검색어태그, keyword 등)
    const tagMatches = [...html.matchAll(/class="[^"]*tag[^"]*"[^>]*>([\s\S]*?)<\/[^>]+>/gi)];
    for (const m of tagMatches) {
      const tag = m[1].replace(/<[^>]+>/g, '').replace(/[#\s]/g, '').trim();
      if (tag && tag.length > 0 && tag.length < 20 && !result.tags.includes(tag)) {
        result.tags.push(tag);
      }
    }

    // 브랜드 / 제조사
    const brandMatch = html.match(/브랜드[^<]*<[^>]+>([\s\S]*?)<\/[^>]+>/i)
      || html.match(/"brand"\s*:\s*"([^"]+)"/i);
    if (brandMatch) result.brand = brandMatch[1].replace(/<[^>]+>/g, '').trim();

    const makerMatch = html.match(/제조사[^<]*<[^>]+>([\s\S]*?)<\/[^>]+>/i)
      || html.match(/"manufacturer"\s*:\s*"([^"]+)"/i);
    if (makerMatch) result.maker = makerMatch[1].replace(/<[^>]+>/g, '').trim();

    // JSON-LD 파싱 (구조화 데이터)
    const jsonLdMatches = [...html.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi)];
    for (const m of jsonLdMatches) {
      try {
        const ld = JSON.parse(m[1]);
        if (ld.name && !result.productName) result.productName = ld.name;
        if (ld.brand?.name && !result.brand) result.brand = ld.brand.name;
        if (ld.offers?.price && !result.price) result.price = ld.offers.price + '원';
        if (ld.offers?.seller?.name && !result.mall) result.mall = ld.offers.seller.name;
      } catch {}
    }

    return res.status(200).json(result);

  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
