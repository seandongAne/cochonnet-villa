import { mediaDetails, entranceCopy } from './media-details.js';

// Edit this file to make the gift personal. Media URLs are relative to public/.
export const birthday = {
  recipient: 'Cabbage',
  title: 'The Little Universe',
  message: 'Of all the stars, in all the skies, how lucky I am to share this little world with you.',
  signature: 'With love, Miss Daidai',
  audio: '/little-universe/audio/background.mp3', // User-selected soundtrack; explicit play only.
};

// Selected by the author. Poster files are local; provenance is kept alongside them.
export const movies = [
  { id: 'notting-hill', title: 'Notting Hill', zh: '诺丁山', year: 1999, note: 'Cabbage’s favorite', poster: '/little-universe/movie-night/notting-hill.webp' },
  { id: 'ford-v-ferrari', title: 'Ford v Ferrari', zh: '极速车王', year: 2019, poster: '/little-universe/movie-night/ford-v-ferrari.webp' },
  { id: 'f1', title: 'F1', zh: 'F1：狂飙飞车', year: 2025, poster: '/little-universe/movie-night/f1.webp' },
  { id: 'tenet', title: 'Tenet', zh: '信条', year: 2020, poster: '/little-universe/movie-night/tenet.webp' },
  { id: 'knives-out', title: 'Knives Out', zh: '利刃出鞘', year: 2019, poster: '/little-universe/movie-night/knives-out.webp' },
  { id: 'finch', title: 'Finch', zh: '芬奇', year: 2021, poster: '/little-universe/movie-night/finch.webp' },
  { id: 'top-gun', title: 'Top Gun', zh: '壮志凌云', year: 1986, poster: '/little-universe/movie-night/top-gun.webp' },
  { id: 'rocketman', title: 'Rocketman', zh: '火箭人', year: 2019, poster: '/little-universe/movie-night/rocketman.webp' },
].map((item) => ({ ...item, ...mediaDetails[item.id] }));

// Shows we have seen together; artwork does not imply a particular production.
export const musicals = [
  { id: 'hamilton', title: 'Hamilton', zh: '汉密尔顿', note: 'Sean’s favorite', poster: '/little-universe/music-world/hamilton.webp' },
  { id: 'rent', title: 'RENT', zh: '吉屋出租', poster: '/little-universe/music-world/rent.webp' },
  { id: 'phantom', title: 'The Phantom of the Opera', zh: '歌剧魅影', poster: '/little-universe/music-world/phantom.webp' },
  { id: 'les-miserables', title: 'Les Misérables', zh: '悲惨世界', poster: '/little-universe/music-world/les-miserables.webp' },
  { id: 'six', title: 'SIX', zh: '六位王后', poster: '/little-universe/music-world/six.webp' },
].map((item) => ({ ...item, ...mediaDetails[item.id] }));

// Our shared television shelf; status reflects the author's viewing, not release dates.
export const series = [
  { id: 'downton-abbey', title: 'Downton Abbey', zh: '唐顿庄园', note: 'Cabbage’s favorite', poster: '/little-universe/one-more-episode/downton-abbey.webp' },
  { id: 'youre-the-worst', title: 'You’re the Worst', zh: '我爱上的人是奇葩', poster: '/little-universe/one-more-episode/youre-the-worst.webp' },
  { id: 'the-good-place', title: 'The Good Place', zh: '善地', poster: '/little-universe/one-more-episode/the-good-place.webp' },
  { id: 'the-good-wife', title: 'The Good Wife', zh: '傲骨贤妻', poster: '/little-universe/one-more-episode/the-good-wife.webp' },
  { id: 'the-good-fight', title: 'The Good Fight', zh: '傲骨之战', poster: '/little-universe/one-more-episode/the-good-fight.webp' },
  { id: 'game-of-thrones', title: 'Game of Thrones', zh: '冰与火之歌 · 权力的游戏', poster: '/little-universe/one-more-episode/game-of-thrones.webp' },
  { id: 'shrinking', title: 'Shrinking', zh: '诊疗中', note: 'Currently watching together', status: 'Watching together', poster: '/little-universe/one-more-episode/shrinking.webp' },
  { id: 'the-man-in-the-high-castle', title: 'The Man in the High Castle', poster: '/little-universe/one-more-episode/the-man-in-the-high-castle.webp' },
].map((item) => ({ ...item, ...mediaDetails[item.id] }));

export const landmarks = [
  {
    id: 'camping', name: 'Camping Forest', zh: '一起去露营',
    subtitle: 'A thousand stars. Two happy campers.', color: '#d9bb82',
    direction: [-0.8, 0.54, 0.25], label: [0, 1.25, 0],
    heading: 'Our second first adventure.',
    message: 'Some adventures take us far away. The best ones bring us a little closer. Here’s to sleepy mornings, warm mugs, and doing it all again tomorrow.',
    caption: 'Little Pig & Bai Baicai · Somewhere under the stars',
    dialogue: [
      { speaker: 'Little Pig', text: 'This is my second time camping.' },
      { speaker: 'Bai Baicai', text: 'When was the first time?' },
      { speaker: 'Little Pig', text: 'Yesterday.' },
    ],
    photos: [{ src: '', alt: 'Little Pig and Bai Baicai camping together', caption: 'Our favorite kind of outside.' }],
    audio: '', video: '', videoPoster: '', videoCaptions: '',
  },
  {
    id: 'music', name: 'The Encore', zh: '唱片与一起看过的音乐剧',
    subtitle: entranceCopy.musicals, color: '#e5a69c',
    direction: [0.08, 0.99, -0.12], label: [0, 1.38, 0],
    heading: 'Our own little listening room.',
    message: 'The records we collect. The musicals we have seen together. From your favorite, Hamilton, to every curtain call we shared — a little room for the music that becomes ours.',
    caption: 'The Encore · Life sounds sweeter with you',
    photos: [{ src: '', alt: 'A favorite record in our listening room', caption: 'One more side, together.' }],
    audio: '', video: '', videoPoster: '', videoCaptions: '',
  },
  {
    id: 'workshop', name: "Hangar", zh: '为你造一个梦',
    subtitle: 'Gundam, favorite builds & a little imagination.', color: '#bfb3dd',
    direction: [0.86, 0.42, 0.23], label: [0, 1.1, 0],
    heading: 'A room for all your favorite things.',
    message: 'Gundam on the workbench, a collection on the wall, and plenty of room for the next small obsession. This little corner is yours.',
    caption: 'Hangar · Made for the things you love',
    photos: [{ src: '', alt: 'Sean’s Gundam and display collection', caption: 'A little space to make something wonderful.' }],
    audio: '', video: '', videoPoster: '', videoCaptions: '',
  },
  {
    id: 'museum', name: 'The Iron & Rose', zh: '钢铁与玫瑰的收藏小屋',
    subtitle: 'A quiet cabin for your collection.', color: '#d6a5a4',
    direction: [-0.12, 0.25, 0.96], label: [0, 0.65, 0.75],
    heading: 'Iron, oak, and a little rose.',
    message: 'A warm wood cabin for the things you collect, with a little softness among the steel.',
    caption: 'The Iron & Rose · A collection of your own',
    photos: [],
    audio: '', video: '', videoPoster: '', videoCaptions: '',
  },
  {
    id: 'movie-night', name: 'The Midnight Matinee', zh: '今晚一起看电影',
    subtitle: entranceCopy.cinema, color: '#ddb77f',
    direction: [.72, -.4, .57], label: [0, 1.33, 0],
    heading: 'One more movie, with you.',
    message: 'A little cinema for the stories we love. The best seat is always the one next to you.',
    caption: 'The Midnight Matinee · A double feature, a lifetime of favorites',
    photos: [], audio: '', video: '', videoPoster: '', videoCaptions: '',
  },
  {
    id: 'one-more-episode', name: 'One More Episode', zh: '再一起看一集',
    subtitle: entranceCopy.series, entranceNote: entranceCopy.seriesSubtitle, color: '#a8c7bc',
    direction: [-.7, -.53, .48], label: [0, 1.1, 0],
    heading: entranceCopy.seriesSubtitle,
    message: 'From Downton to the Good Place, a little room for the worlds we keep coming back to. And tonight, another episode of Shrinking.',
    caption: 'One More Episode · The best company for every season',
    photos: [], audio: '', video: '', videoPoster: '', videoCaptions: '',
  },
];

export function visitLandmark(visited, id) {
  return landmarks.some((place) => place.id === id) && !visited.includes(id) ? [...visited, id] : visited;
}

export function surfacePosition(direction, radius = 2.5) {
  const length = Math.hypot(...direction);
  if (!length) throw new RangeError('A surface direction must be nonzero.');
  return direction.map((value) => value / length * radius);
}
