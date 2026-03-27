import sceneBlueprintsJson from './scenes.json';

type PositionedGiftBase = {
  id: string;
  label: string;
  boxX: string;
  boxY: string;
};

export type GiftItem =
  | (PositionedGiftBase & {
      giftType: 'photo' | 'video' | 'audio';
      giftSrc: string;
    })
  | (PositionedGiftBase & {
      giftType: 'text';
      textSrc: string;
    });

type SceneBlueprint = {
  parallaxText: string;
  location: string;
  day: string;
  bg?: string;
  gifts?: GiftBlueprint[];
};

type LegacySceneBlueprint = Omit<SceneBlueprint, 'bg' | 'gifts'>;

type GiftBlueprint =
  | string
  | {
      asset: string;
      label?: string;
    };

type MakerBlueprint = {
  id?: string;
  title: string;
  parallaxText?: string;
  introLabel?: string;
  bg?: string;
  ambientAudio?: string;
  scenes: SceneBlueprint[];
};

type MakersSceneDocument = {
  makers: MakerBlueprint[];
};

export type SceneData = Omit<SceneBlueprint, 'bg' | 'gifts'> & {
  id: string;
  kind: 'scene';
  makerTitle?: string;
  bg: string;
  backgroundAudio?: string;
  gifts: GiftItem[];
};

export type MakerSlide = {
  id: string;
  kind: 'maker';
  parallaxText: string;
  title: string;
  subtitle: string;
  bg: string;
  backgroundAudio?: string;
  gifts: [];
};

export type ExperienceSlide = SceneData | MakerSlide;

type MediaGift =
  | {
      id: string;
      label: string;
      giftType: 'photo' | 'video' | 'audio';
      giftSrc: string;
    }
  | {
      id: string;
      label: string;
      giftType: 'text';
      textSrc: string;
    };

type BinaryMediaGift = Extract<MediaGift, { giftSrc: string }>;
type GiftCoordinate = {
  x: number;
  y: number;
};

const MAX_MEDIA_ITEMS = 10;
const POSITION_BOUNDS = {
  minX: 18,
  maxX: 82,
  minY: 50,
  maxY: 80,
};
const MIN_GIFT_DISTANCE = 18;
const MAX_POSITION_ATTEMPTS = 40;

const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.avif']);
const VIDEO_EXTENSIONS = new Set(['.mp4', '.mov', '.webm', '.m4v']);
const AUDIO_EXTENSIONS = new Set(['.mp3', '.m4a', '.wav', '.ogg', '.aac']);

const backgroundModules = import.meta.glob('../assets/bg/*.{png,jpg,jpeg,gif,webp,avif}', {
  eager: true,
  import: 'default',
}) as Record<string, string>;

const mediaAssetModules = import.meta.glob(
  '../assets/media/**/*.{png,jpg,jpeg,gif,webp,avif,PNG,JPG,JPEG,GIF,WEBP,AVIF,mp4,mov,webm,m4v,MP4,MOV,WEBM,M4V,mp3,m4a,wav,ogg,aac,MP3,M4A,WAV,OGG,AAC}',
  {
    eager: true,
    import: 'default',
  },
) as Record<string, string>;

const mediaTextModules = import.meta.glob('../assets/media/**/*.{txt,md}', {
  eager: true,
  import: 'default',
}) as Record<string, string>;

const BACKGROUND_ROOT = '../assets/bg/';
const MEDIA_ROOT = '../assets/media/';

function shuffle<T>(items: T[]) {
  const copy = [...items];

  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }

  return copy;
}

function randomInRange(min: number, max: number) {
  return Math.random() * (max - min) + min;
}

function getFileName(path: string) {
  return path.split('/').pop() ?? path;
}

function normalizeAssetKey(path: string) {
  return path.replace(/\\/g, '/').replace(/^\.?\//, '').replace(/^\/+/, '').toLowerCase();
}

function stripAllExtensions(path: string) {
  let value = path;

  while (/\.[^.\/]+$/.test(value)) {
    value = value.replace(/\.[^.\/]+$/, '');
  }

  return value;
}

function shouldSkipFile(path: string) {
  const fileName = getFileName(path);
  return fileName.startsWith('.') || fileName === '.gitkeep';
}

function getExtension(path: string) {
  const fileName = getFileName(path);
  const dotIndex = fileName.lastIndexOf('.');
  return dotIndex >= 0 ? fileName.slice(dotIndex).toLowerCase() : '';
}

function formatLabel(path: string) {
  return getFileName(path)
    .replace(/\.[^.]+$/, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function createAssetLookup<T>(modules: Record<string, T>, root: string) {
  const lookup = new Map<string, T>();

  Object.entries(modules).forEach(([path, value]) => {
    if (shouldSkipFile(path)) {
      return;
    }

    const relativePath = path.startsWith(root) ? path.slice(root.length) : getFileName(path);
    const fileName = getFileName(path);
    const keys = [
      relativePath,
      fileName,
      path,
      stripAllExtensions(relativePath),
      stripAllExtensions(fileName),
    ];

    keys.forEach((key) => {
      const normalizedKey = normalizeAssetKey(key);

      if (!lookup.has(normalizedKey)) {
        lookup.set(normalizedKey, value);
      }
    });
  });

  return lookup;
}

function isDirectAssetReference(path: string) {
  return /^(https?:)?\/\//.test(path) || path.startsWith('data:') || path.startsWith('/');
}

const backgroundLookup = createAssetLookup(backgroundModules, BACKGROUND_ROOT);
const mediaAssetLookup = createAssetLookup(mediaAssetModules, MEDIA_ROOT);
const mediaTextLookup = createAssetLookup(mediaTextModules, MEDIA_ROOT);

function toPercent(value: number) {
  return `${value.toFixed(1)}%`;
}

function createGiftPosition(usedCoordinates: GiftCoordinate[]) {
  let fallback = {
    x: randomInRange(POSITION_BOUNDS.minX, POSITION_BOUNDS.maxX),
    y: randomInRange(POSITION_BOUNDS.minY, POSITION_BOUNDS.maxY),
  };

  for (let attempt = 0; attempt < MAX_POSITION_ATTEMPTS; attempt += 1) {
    const candidate = {
      x: randomInRange(POSITION_BOUNDS.minX, POSITION_BOUNDS.maxX),
      y: randomInRange(POSITION_BOUNDS.minY, POSITION_BOUNDS.maxY),
    };
    fallback = candidate;

    const overlapsExisting = usedCoordinates.some((coordinate) => {
      return Math.hypot(candidate.x - coordinate.x, candidate.y - coordinate.y) < MIN_GIFT_DISTANCE;
    });

    if (!overlapsExisting) {
      return candidate;
    }
  }

  return fallback;
}

function getBackgrounds(sceneCount: number) {
  const backgrounds = Object.entries(backgroundModules)
    .filter(([path]) => !shouldSkipFile(path))
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([, src]) => src);

  if (backgrounds.length === 0) {
    return Array.from({ length: sceneCount }, () => '');
  }

  return Array.from({ length: sceneCount }, (_, index) => backgrounds[index % backgrounds.length]);
}

function resolveBackground(backgroundRef: string | undefined, fallback: string) {
  if (!backgroundRef) {
    return fallback;
  }

  if (isDirectAssetReference(backgroundRef)) {
    return backgroundRef;
  }

  return backgroundLookup.get(normalizeAssetKey(backgroundRef)) ?? fallback;
}

function resolveMediaAsset(assetRef: string | undefined) {
  if (!assetRef) {
    return undefined;
  }

  if (isDirectAssetReference(assetRef)) {
    return assetRef;
  }

  return mediaAssetLookup.get(normalizeAssetKey(assetRef));
}

function createGiftItem(gift: GiftBlueprint, defaultId: string) {
  const assetRef = typeof gift === 'string' ? gift : gift.asset;
  const label = typeof gift === 'string' ? formatLabel(gift) : gift.label ?? formatLabel(gift.asset);
  const normalizedRef = normalizeAssetKey(assetRef);
  const normalizedBaseRef = normalizeAssetKey(stripAllExtensions(assetRef));
  const extension = getExtension(assetRef);

  const textContent = mediaTextLookup.get(normalizedRef) ?? mediaTextLookup.get(normalizedBaseRef);
  if (textContent && (extension === '.txt' || extension === '.md')) {
    return {
      id: defaultId,
      label,
      giftType: 'text' as const,
      textSrc: textContent,
    };
  }

  const mediaSrc =
    mediaAssetLookup.get(normalizedRef) ??
    mediaAssetLookup.get(normalizedBaseRef) ??
    (isDirectAssetReference(assetRef) ? assetRef : undefined);

  if (!mediaSrc) {
    return null;
  }

  if (IMAGE_EXTENSIONS.has(extension)) {
    return {
      id: defaultId,
      label,
      giftType: 'photo' as const,
      giftSrc: mediaSrc,
    };
  }

  if (VIDEO_EXTENSIONS.has(extension)) {
    return {
      id: defaultId,
      label,
      giftType: 'video' as const,
      giftSrc: mediaSrc,
    };
  }

  if (AUDIO_EXTENSIONS.has(extension)) {
    return {
      id: defaultId,
      label,
      giftType: 'audio' as const,
      giftSrc: mediaSrc,
    };
  }

  return null;
}

function createMediaGifts() {
  const binaryMedia: BinaryMediaGift[] = Object.entries(mediaAssetModules)
    .filter(([path]) => !shouldSkipFile(path))
    .map(([path, src]) => {
      const extension = getExtension(path);
      const label = formatLabel(path);
      const id = path;

      if (IMAGE_EXTENSIONS.has(extension)) {
        return { id, label, giftType: 'photo' as const, giftSrc: src };
      }

      if (VIDEO_EXTENSIONS.has(extension)) {
        return { id, label, giftType: 'video' as const, giftSrc: src };
      }

      if (AUDIO_EXTENSIONS.has(extension)) {
        return { id, label, giftType: 'audio' as const, giftSrc: src };
      }

      return null;
    })
    .filter((item): item is BinaryMediaGift => item !== null);

  const textMedia: MediaGift[] = Object.entries(mediaTextModules)
    .filter(([path]) => !shouldSkipFile(path))
    .map(([path, content]) => ({
      id: path,
      label: formatLabel(path),
      giftType: 'text' as const,
      textSrc: content,
    }));

  return shuffle([...binaryMedia, ...textMedia]).slice(0, MAX_MEDIA_ITEMS);
}

function assignGiftsToScenes(sceneCount: number) {
  const giftsByScene = Array.from({ length: sceneCount }, () => [] as GiftItem[]);
  const coordinatesByScene = Array.from({ length: sceneCount }, () => [] as GiftCoordinate[]);
  const sceneOrder = shuffle(Array.from({ length: sceneCount }, (_, index) => index));

  createMediaGifts().forEach((gift, index) => {
    const sceneIndex = sceneOrder[index % sceneCount];
    const coordinate = createGiftPosition(coordinatesByScene[sceneIndex]);

    coordinatesByScene[sceneIndex].push(coordinate);
    giftsByScene[sceneIndex].push({
      ...gift,
      boxX: toPercent(coordinate.x),
      boxY: toPercent(coordinate.y),
    });
  });

  return giftsByScene;
}

function isMakersSceneDocument(value: unknown): value is MakersSceneDocument {
  return typeof value === 'object' && value !== null && Array.isArray((value as MakersSceneDocument).makers);
}

function createSceneGifts(scene: SceneBlueprint) {
  const giftBlueprints = scene.gifts ?? [];
  const coordinates: GiftCoordinate[] = [];

  return giftBlueprints.reduce<GiftItem[]>((gifts, gift, index) => {
    const giftItem = createGiftItem(gift, `${scene.location}-${index + 1}`);

    if (!giftItem) {
      return gifts;
    }

    const coordinate = createGiftPosition(coordinates);
    coordinates.push(coordinate);
    gifts.push({
      ...giftItem,
      boxX: toPercent(coordinate.x),
      boxY: toPercent(coordinate.y),
    });

    return gifts;
  }, []);
}

function buildLegacySceneData(sceneBlueprints: LegacySceneBlueprint[]) {
  const backgrounds = getBackgrounds(sceneBlueprints.length);
  const giftsByScene = assignGiftsToScenes(sceneBlueprints.length);

  return sceneBlueprints.map<SceneData>((scene, index) => ({
    ...scene,
    id: `scene-${index + 1}`,
    kind: 'scene',
    bg: backgrounds[index],
    gifts: giftsByScene[index],
  }));
}

function buildMakerSlides(document: MakersSceneDocument) {
  const fallbackBackgrounds = getBackgrounds(
    document.makers.reduce((count, maker) => count + Math.max(maker.scenes.length, 1), 0),
  );
  let fallbackBackgroundIndex = 0;

  return document.makers.flatMap<ExperienceSlide>((maker, makerIndex) => {
    const makerId = maker.id ?? `maker-${makerIndex + 1}`;
    const makerFallbackBackground = fallbackBackgrounds[fallbackBackgroundIndex] ?? '';
    const introBackground = resolveBackground(maker.bg ?? maker.scenes[0]?.bg, makerFallbackBackground);

    fallbackBackgroundIndex += Math.max(maker.scenes.length, 1);

    const introSlide: MakerSlide = {
      id: `${makerId}-intro`,
      kind: 'maker',
      parallaxText: maker.parallaxText ?? maker.title,
      title: maker.title,
      subtitle: maker.introLabel ?? 'Presents',
      bg: introBackground,
      backgroundAudio: resolveMediaAsset(maker.ambientAudio),
      gifts: [],
    };

    const sceneSlides = maker.scenes.map<SceneData>((scene, sceneIndex) => ({
      id: `${makerId}-scene-${sceneIndex + 1}`,
      kind: 'scene',
      parallaxText: scene.parallaxText,
      location: scene.location,
      day: scene.day,
      makerTitle: maker.title,
      bg: resolveBackground(scene.bg, introBackground),
      backgroundAudio: resolveMediaAsset(maker.ambientAudio),
      gifts: createSceneGifts(scene),
    }));

    return [introSlide, ...sceneSlides];
  });
}

const documentData = sceneBlueprintsJson as LegacySceneBlueprint[] | MakersSceneDocument;

export const GIFT_DATA: ExperienceSlide[] = isMakersSceneDocument(documentData)
  ? buildMakerSlides(documentData)
  : buildLegacySceneData(documentData);
