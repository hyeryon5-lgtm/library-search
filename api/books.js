const NAVER_CLIENT_ID     = process.env.NAVER_CLIENT_ID;
const NAVER_CLIENT_SECRET = process.env.NAVER_CLIENT_SECRET;

async function searchGoogle(title) {
  const url = `https://www.googleapis.com/books/v1/volumes?q=intitle:${encodeURIComponent(title)}&maxResults=1&fields=items(volumeInfo(title,authors,imageLinks))`;
  const res  = await fetch(url);
  const data = await res.json();
  if (!data.items?.length) return null;
  const info = data.items[0].volumeInfo;
  return {
    foundTitle:  info.title || '',
    foundAuthor: (info.authors || []).join(', '),
    thumb: (info.imageLinks?.thumbnail || info.imageLinks?.smallThumbnail || '').replace('http://', 'https://'),
  };
}

async function searchOpenLibrary(title) {
  const url  = `https://openlibrary.org/search.json?title=${encodeURIComponent(title)}&limit=1&fields=title,author_name,cover_i`;
  const res  = await fetch(url, { headers: { 'User-Agent': 'LibrarySearchApp/1.0' } });
  const data = await res.json();
  if (!data.docs?.length) return null;
  const doc = data.docs[0];
  return {
    foundTitle:  doc.title || '',
    foundAuthor: (doc.author_name || []).join(', '),
    thumb: doc.cover_i ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-M.jpg` : '',
  };
}

async function searchNaver(title) {
  if (!NAVER_CLIENT_ID || !NAVER_CLIENT_SECRET) return null;
  const url  = `https://openapi.naver.com/v1/search/book.json?query=${encodeURIComponent(title)}&display=1`;
  const res  = await fetch(url, {
    headers: {
      'X-Naver-Client-Id':     NAVER_CLIENT_ID,
      'X-Naver-Client-Secret': NAVER_CLIENT_SECRET,
    },
  });
  const data = await res.json();
  if (!data.items?.length) return null;
  const item = data.items[0];
  return {
    foundTitle:  (item.title || '').replace(/<[^>]+>/g, ''),
    foundAuthor: (item.author || '').replace(/<[^>]+>/g, ''),
    thumb: item.image || '',
  };
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { title } = req.query;
  if (!title?.trim()) return res.status(400).json({ error: '제목을 입력해주세요' });

  const [google, openlib, naver] = await Promise.all([
    searchGoogle(title).catch(() => null),
    searchOpenLibrary(title).catch(() => null),
    searchNaver(title).catch(() => null),
  ]);

  return res.json({ google, openlib, naver });
};
