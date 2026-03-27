import { useEffect, useRef, useState } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { ScrollToPlugin } from 'gsap/ScrollToPlugin';
import { motion, AnimatePresence } from 'motion/react';
import {
  ChevronLeft,
  ChevronRight,
  Gift,
  MapPin,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { GIFT_DATA, type GiftItem } from './data/giftData';

gsap.registerPlugin(ScrollTrigger, ScrollToPlugin);

const LAST_SLIDE_INDEX = Math.max(GIFT_DATA.length - 1, 0);
const PARALLAX_TICKER_REPEATS = 4;
const BACKGROUND_AUDIO_VOLUME = 0.16;
const MAKER_NAV_ITEMS = GIFT_DATA
  .map((slide, index) =>
    slide.kind === 'maker'
      ? {
          index,
          id: slide.id,
          label: slide.subtitle || slide.title,
          title: slide.title,
        }
      : null,
  )
  .filter((item): item is { index: number; id: string; label: string; title: string } => item !== null);

export default function App() {
  const [started, setStarted] = useState(false);
  const [selectedGift, setSelectedGift] = useState<GiftItem | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [experienceKey, setExperienceKey] = useState(0);
  const [selectedGiftText, setSelectedGiftText] = useState('');
  const [isLoadingGiftText, setIsLoadingGiftText] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const currentSlide = GIFT_DATA[currentIndex];
  const currentBackgroundAudio = currentSlide?.backgroundAudio;
  const activeMakerNavIndex =
    [...MAKER_NAV_ITEMS].reverse().find((item) => currentIndex >= item.index)?.index ?? MAKER_NAV_ITEMS[0]?.index ?? 0;
  
  const containerRef = useRef<HTMLDivElement>(null);
  const sectionsRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  // Initialize GSAP Horizontal Scroll
  const scrollAnimRef = useRef<gsap.core.Tween | null>(null);

  useEffect(() => {
    if (!started) return;

    const sections = gsap.utils.toArray('.slide-section');

    const ctx = gsap.context(() => {
      // Main horizontal scroll
      const totalWidth = sectionsRef.current?.offsetWidth || (window.innerWidth * sections.length);
      const scrollDistance = totalWidth - window.innerWidth;
      const snapValue = LAST_SLIDE_INDEX > 0 ? 1 / LAST_SLIDE_INDEX : 1;

      scrollAnimRef.current = gsap.to(sectionsRef.current, {
        x: () => -(totalWidth - window.innerWidth),
        ease: 'none',
        scrollTrigger: {
          trigger: containerRef.current,
          pin: true,
          scrub: 1,
          snap: snapValue,
          start: 'top top',
          end: () => `+=${scrollDistance}`,
          id: 'mainScroll',
          onUpdate: (self) => {
            const index = Math.round(self.progress * LAST_SLIDE_INDEX);
            setCurrentIndex(index);
          }
        },
      });

        // Parallax text and gift boxes
      sections.forEach((section: any, index: number) => {
        const giftBoxes = section.querySelectorAll('.gift-box-container');
        const bgImg = section.querySelector('.parallax-bg-img');

        // Background image parallax
        gsap.fromTo(bgImg, 
          { x: '-5%' },
          { 
            x: '5%', 
            ease: 'none',
            scrollTrigger: {
              trigger: section,
              containerAnimation: scrollAnimRef.current!,
              start: 'left right',
              end: 'right left',
              scrub: true,
            }
          }
        );

        // Gift box floating animation
        giftBoxes.forEach((giftBox: any, gIndex: number) => {
          gsap.to(giftBox, {
            y: '+=15',
            duration: 2.5,
            repeat: -1,
            yoyo: true,
            ease: 'sine.inOut',
            delay: (index * 0.2) + (gIndex * 0.3)
          });

          // Entrance animations
          if (index === 0) {
            // Immediate entrance for first slide
            gsap.fromTo(giftBox, 
              { opacity: 0, y: 30 },
              { opacity: 1, y: 0, duration: 1, delay: 0.2 + (gIndex * 0.2), ease: 'power2.out' }
            );
          } else {
            // Scroll-triggered entrance for others
            gsap.from(giftBox, {
              scale: 0.5,
              opacity: 0,
              duration: 1,
              ease: 'back.out(1.7)',
              scrollTrigger: {
                trigger: section,
                containerAnimation: scrollAnimRef.current!,
                start: 'left 85%',
              }
            });
          }
        });

      });

      // Force a refresh after a short delay to ensure correct measurements
      const refreshTimeout = setTimeout(() => {
        ScrollTrigger.refresh();
      }, 100);

      const handleResize = () => {
        ScrollTrigger.refresh();
      };
      window.addEventListener('resize', handleResize);

      return () => {
        clearTimeout(refreshTimeout);
        window.removeEventListener('resize', handleResize);
      };
    }, containerRef);

    return () => {
      ctx.revert();
      scrollAnimRef.current = null;
    };
  }, [started]);

  // Handle configurable background audio
  useEffect(() => {
    if (!audioRef.current) {
      return;
    }

    const audioElement = audioRef.current;
    audioElement.volume = BACKGROUND_AUDIO_VOLUME;

    if (!started || !currentBackgroundAudio) {
      audioElement.pause();
      audioElement.removeAttribute('src');
      audioElement.load();
      return;
    }

    if (audioElement.getAttribute('src') !== currentBackgroundAudio) {
      audioElement.src = currentBackgroundAudio;
      audioElement.load();
    }

    audioElement.play().catch((error) => console.log('Autoplay blocked', error));
  }, [started, currentBackgroundAudio]);

  // Pause music when modal is open with video/audio
  useEffect(() => {
    if (audioRef.current) {
      if (selectedGift && (selectedGift.giftType === 'video' || selectedGift.giftType === 'audio')) {
        audioRef.current.pause();
      } else if (started && currentBackgroundAudio) {
        audioRef.current.play().catch(() => {});
      }
    }
  }, [selectedGift, started, currentBackgroundAudio]);

  useEffect(() => {
    if (!selectedGift || selectedGift.giftType !== 'text') {
      setSelectedGiftText('');
      setIsLoadingGiftText(false);
      return;
    }

    const abortController = new AbortController();
    setIsLoadingGiftText(true);

    fetch(selectedGift.textSrc, { signal: abortController.signal })
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Failed to load text gift: ${response.status}`);
        }

        return response.text();
      })
      .then((text) => {
        setSelectedGiftText(text.trim());
      })
      .catch((error) => {
        if (abortController.signal.aborted) {
          return;
        }

        console.error(error);
        setSelectedGiftText('Unable to load this message right now.');
      })
      .finally(() => {
        if (!abortController.signal.aborted) {
          setIsLoadingGiftText(false);
        }
      });

    return () => {
      abortController.abort();
    };
  }, [selectedGift]);

  const scrollToIndex = (index: number) => {
    const trigger = ScrollTrigger.getById('mainScroll');
    if (trigger) {
      const totalScroll = trigger.end - trigger.start;
      const target =
        LAST_SLIDE_INDEX > 0
          ? trigger.start + (index / LAST_SLIDE_INDEX) * totalScroll
          : trigger.start;
      
      gsap.to(window, {
        scrollTo: target,
        duration: 1.2,
        ease: 'power3.inOut'
      });
    }
  };

  const handleStart = () => {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    setStarted(true);
  };

  const handleReplay = () => {
    ScrollTrigger.getById('mainScroll')?.kill();
    scrollAnimRef.current?.kill();
    scrollAnimRef.current = null;
    ScrollTrigger.clearScrollMemory();

    setSelectedGift(null);
    setSelectedGiftText('');
    setStarted(false);
    setCurrentIndex(0);
    setExperienceKey((value) => value + 1);

    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }

    requestAnimationFrame(() => {
      window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
      ScrollTrigger.refresh();
    });
  };

  const toggleMute = () => {
    if (audioRef.current) {
      audioRef.current.muted = !isMuted;
      setIsMuted(!isMuted);
    }
  };

  return (
    <div className="relative w-full min-h-screen bg-charcoal text-cream selection:bg-gold selection:text-charcoal">
      {/* Background Audio */}
      <audio ref={audioRef} loop />

      {/* Start Screen Overlay */}
      <AnimatePresence>
        {!started && (
          <motion.div
            initial={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-charcoal"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 1, ease: "easeOut" }}
              className="text-center"
            >
              <h1 className="text-4xl sm:text-5xl md:text-7xl mb-6 md:mb-8 tracking-widest uppercase font-serif px-4">
                An Omnipresent For You
              </h1>
              <p className="text-gold/80 italic mb-8 md:mb-12 text-base md:text-lg tracking-wide px-4">
                Experience the magic of your special day
              </p>
              <button
                onClick={handleStart}
                className="group relative px-12 py-4 border border-gold/30 hover:border-gold transition-colors duration-500 overflow-hidden"
              >
                <span className="relative z-10 text-gold uppercase tracking-[0.2em] text-sm font-semibold">
                  Begin Your Journey
                </span>
                <div className="absolute inset-0 bg-gold/5 transform scale-x-0 group-hover:scale-x-100 transition-transform duration-500 origin-left" />
              </button>
            </motion.div>
            
            <div className="absolute bottom-12 text-xs uppercase tracking-[0.3em] opacity-30">
              Turn on sound for the full experience
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Experience */}
      {started && (
        <div key={experienceKey}>
          {MAKER_NAV_ITEMS.length > 0 && (
            <div className="fixed left-4 top-1/2 z-[70] flex -translate-y-1/2 flex-col gap-2 md:left-6">
              {MAKER_NAV_ITEMS.map((item) => {
                const isActive = item.index === activeMakerNavIndex;

                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => scrollToIndex(item.index)}
                    className={`rounded-full border px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-[0.22em] backdrop-blur-md transition-all md:px-4 ${
                      isActive
                        ? 'border-gold/45 bg-gold/18 text-gold shadow-[0_0_18px_rgba(212,175,55,0.16)]'
                        : 'border-white/10 bg-black/18 text-cream/70 hover:border-gold/25 hover:bg-white/8 hover:text-gold'
                    }`}
                    title={item.title}
                  >
                    {item.label}
                  </button>
                );
              })}
            </div>
          )}

          {/* Navigation Controls */}
          <div className="fixed bottom-8 right-8 md:bottom-12 md:right-12 z-[60] flex items-center gap-3 md:gap-4">
            <button
              onClick={() => scrollToIndex(Math.max(0, currentIndex - 1))}
              disabled={currentIndex === 0}
              className="p-3 md:p-4 rounded-full border border-white/10 bg-white/5 backdrop-blur-md hover:bg-gold/20 disabled:opacity-20 transition-all cursor-pointer active:scale-95"
            >
              <ChevronLeft size={20} className="md:w-6 md:h-6 text-gold" />
            </button>
            <button
              onClick={() => scrollToIndex(Math.min(LAST_SLIDE_INDEX, currentIndex + 1))}
              disabled={currentIndex === LAST_SLIDE_INDEX}
              className="p-3 md:p-4 rounded-full border border-white/10 bg-white/5 backdrop-blur-md hover:bg-gold/20 disabled:opacity-20 transition-all cursor-pointer active:scale-95"
            >
              <ChevronRight size={20} className="md:w-6 md:h-6 text-gold" />
            </button>
          </div>

          {/* Audio Controls */}
          <div className="fixed top-8 left-8 z-50">
            <button
              onClick={handleReplay}
              className="rounded-full border border-white/10 bg-white/5 px-5 py-3 text-xs font-semibold uppercase tracking-[0.25em] text-gold backdrop-blur-md transition-all hover:bg-gold/15"
            >
              Start Again
            </button>
          </div>

          <div className="fixed top-8 right-8 z-50 flex items-center gap-4">
            <button
              onClick={toggleMute}
              className="p-3 rounded-full border border-white/10 bg-white/5 backdrop-blur-md hover:bg-white/10 transition-all"
            >
              {isMuted ? <VolumeX size={20} className="text-gold" /> : <Volume2 size={20} className="text-gold" />}
            </button>
          </div>

          {/* Horizontal Scroll Container */}
          <div ref={containerRef} className="w-full h-screen overflow-hidden">
            <div 
              ref={sectionsRef} 
              className="flex h-full"
              style={{ width: `${GIFT_DATA.length * 100}vw` }}
            >
              {GIFT_DATA.map((slide, index) => (
                <section
                  key={slide.id}
                  className="slide-section relative w-screen h-full flex-shrink-0 flex items-center justify-center overflow-hidden"
                >
                  {/* Background Image with Overlay */}
                  <div className="absolute inset-0 flex items-center justify-center overflow-hidden bg-charcoal">
                    <img 
                      src={slide.bg}
                      alt=""
                      className="parallax-bg-img h-full w-full object-contain"
                    />
                    <div className="absolute inset-0 bg-charcoal/50" />
                  </div>

                  {/* Parallax Background Text */}
                  <div className="parallax-bg-text absolute bottom-[5.4rem] left-0 right-0 z-[5] pointer-events-none overflow-hidden select-none md:bottom-[6rem]">
                    <div className="parallax-bg-text-track">
                      {[0, 1].map((groupIndex) => (
                        <div key={`${slide.id}-ticker-${groupIndex}`} className="parallax-bg-text-group">
                          {Array.from({ length: PARALLAX_TICKER_REPEATS }).map((_, itemIndex) => (
                            <span
                              key={`${slide.id}-ticker-${groupIndex}-${itemIndex}`}
                              className="parallax-bg-text-item"
                            >
                              {slide.parallaxText}
                            </span>
                          ))}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Content Wrapper */}
                  <div className="relative z-10 w-full h-full">
                    {slide.kind === 'maker' ? (
                      <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.5 }}
                        className="absolute top-[62%] left-1/2 flex w-full max-w-4xl -translate-x-1/2 -translate-y-1/2 flex-col items-center px-8 text-center"
                      >
                        <div className="mx-auto inline-flex max-w-full flex-col items-center rounded-[2rem] border border-white/8 bg-black/12 px-5 py-4 backdrop-blur-[10px] md:px-8 md:py-5">
                          <div className="mb-3 inline-flex items-center justify-center rounded-full border border-gold/20 bg-black/20 px-4 py-2 text-gold/85 shadow-[0_0_24px_rgba(212,175,55,0.08)]">
                            <span className="text-xs font-semibold uppercase tracking-[0.24em] md:text-sm">
                              {slide.subtitle}
                            </span>
                          </div>
                          <h2 className="max-w-4xl text-4xl font-serif uppercase tracking-[0.12em] text-cream drop-shadow-[0_8px_28px_rgba(0,0,0,0.35)] sm:text-5xl md:text-7xl">
                            {slide.title}
                          </h2>
                        </div>
                      </motion.div>
                    ) : (
                      <motion.div 
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.5 }}
                        className="absolute top-[34%] left-1/2 w-full max-w-5xl -translate-x-1/2 -translate-y-1/2 px-4 text-center pointer-events-none"
                      >
                        <div className="mx-auto inline-flex max-w-full flex-col items-center rounded-[2rem] border border-white/8 bg-black/12 px-5 py-4 backdrop-blur-[10px] md:px-8 md:py-5">
                          <div className="mb-3 inline-flex items-center justify-center gap-2 rounded-full border border-gold/20 bg-black/20 px-4 py-2 text-gold/85 shadow-[0_0_24px_rgba(212,175,55,0.08)]">
                            <MapPin size={13} />
                            <span className="text-xs font-semibold uppercase tracking-[0.24em] md:text-sm">
                              {slide.day}
                            </span>
                          </div>
                          <h2 className="max-w-4xl text-3xl font-serif leading-none text-cream drop-shadow-[0_8px_28px_rgba(0,0,0,0.35)] sm:text-4xl md:text-6xl">
                            {slide.location}
                          </h2>
                        </div>
                      </motion.div>
                    )}

                    {/* Gift Boxes - Multiple support */}
                    {slide.gifts.map((gift, gIndex) => (
                      <button
                        key={gift.id}
                        type="button"
                        className="gift-box-container absolute cursor-pointer group"
                        style={{ 
                          left: gift.boxX || '50%', 
                          top: gift.boxY || '50%',
                          transform: 'translate(-50%, -50%)'
                        }}
                        onClick={() => {
                          setSelectedGift(gift);
                        }}
                      >
                        <div className="absolute -inset-8 rounded-full bg-gold/20 opacity-0 blur-3xl transition-opacity duration-300 group-hover:opacity-100" />
                        <div className="flex h-24 w-24 items-center justify-center rounded-[2rem] border border-gold/40 bg-[radial-gradient(circle_at_top,_rgba(255,232,170,0.35),_rgba(212,175,55,0.14)_45%,_rgba(10,10,10,0.82)_100%)] shadow-[0_20px_50px_rgba(212,175,55,0.3)] backdrop-blur-md transition-transform duration-300 ease-out will-change-transform group-hover:scale-[1.03] sm:h-32 sm:w-32 md:h-40 md:w-40">
                          <Gift className="h-10 w-10 text-gold transition-transform duration-300 ease-out group-hover:scale-105 sm:h-12 sm:w-12 md:h-14 md:w-14" />
                        </div>
                        <div className="absolute inset-0 flex items-center justify-center opacity-0 transition-opacity duration-200 group-hover:opacity-100">
                          <div className="bg-gold text-charcoal px-6 py-2 rounded-full text-xs font-bold uppercase tracking-widest shadow-xl">
                            Open Gift
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>

                  {/* Slide Number */}
                  <div className="absolute bottom-12 left-12 flex items-center gap-4">
                    <span className="text-gold font-serif text-2xl">0{index + 1}</span>
                    <div className="w-12 h-[1px] bg-gold/30" />
                    <span className="text-xs uppercase tracking-[0.4em] opacity-30">Journey</span>
                  </div>
                </section>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Modal Experience */}
      <AnimatePresence>
        {selectedGift && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] flex items-center justify-center p-4 md:p-8 bg-charcoal/95 backdrop-blur-xl"
          >
          <motion.div
            initial={{ scale: 0.9, y: 20, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0.9, y: 20, opacity: 0 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="relative w-full max-w-4xl overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] shadow-2xl"
          >
              {/* Close Button */}
              <button
                onClick={() => setSelectedGift(null)}
                className="absolute top-6 right-6 z-[210] p-2 bg-charcoal/50 hover:bg-gold/20 text-white hover:text-gold rounded-full transition-all"
              >
                <X size={24} />
              </button>

              <div className="relative max-h-[85vh] min-h-[300px] overflow-hidden bg-black/40">
                {selectedGift.giftType === 'video' && (
                  <>
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                      <div className="w-12 h-12 border-4 border-gold/20 border-t-gold rounded-full animate-spin" />
                    </div>
                    <video
                      src={selectedGift.giftSrc}
                      controls
                      autoPlay
                      playsInline
                      controlsList="nofullscreen noremoteplayback"
                      disablePictureInPicture
                      disableRemotePlayback
                      onEnded={() => setSelectedGift(null)}
                      className="relative z-10 h-full max-h-[85vh] w-full object-contain"
                    />
                    <div className="pointer-events-none absolute bottom-4 left-1/2 z-20 -translate-x-1/2 rounded-full border border-white/10 bg-black/35 px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.22em] text-cream/70 backdrop-blur-md md:text-xs">
                      Tap close to return
                    </div>
                  </>
                )}
                {selectedGift.giftType === 'photo' && (
                  <>
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                      <div className="w-12 h-12 border-4 border-gold/20 border-t-gold rounded-full animate-spin" />
                    </div>
                    <img
                      src={selectedGift.giftSrc}
                      alt="Memory"
                      className="relative z-10 h-full max-h-[85vh] w-full object-contain p-4"
                    />
                  </>
                )}
                {selectedGift.giftType === 'audio' && (
                  <div className="relative flex min-h-[300px] max-h-[85vh] flex-col items-center justify-center gap-8 p-8 md:p-12">
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-20">
                      <div className="w-48 h-48 border-4 border-gold/10 border-t-gold rounded-full animate-spin" />
                    </div>
                    <div className="relative z-10 flex h-28 w-28 items-center justify-center rounded-full bg-gold/10 md:h-32 md:w-32">
                      <Volume2 size={48} className="text-gold" />
                    </div>
                    <audio
                      src={selectedGift.giftSrc}
                      controls
                      autoPlay
                      className="relative z-10 w-full max-w-md"
                    />
                  </div>
                )}
                {selectedGift.giftType === 'text' && (
                  <div className="max-h-[85vh] overflow-y-auto p-8 md:p-16 scrollbar-hide [WebkitOverflowScrolling:touch]">
                    <div className="mx-auto max-w-prose">
                      <div className="mb-8 h-1 w-12 bg-gold" />
                      <p className="font-[var(--font-handwriting)] text-3xl leading-relaxed text-cream/90 md:text-5xl md:leading-relaxed">
                        {isLoadingGiftText ? 'Loading message...' : selectedGiftText}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Progress Indicator */}
      {started && (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2">
          {GIFT_DATA.map((_, i) => (
            <div key={i} className="w-2 h-2 rounded-full bg-white/10 overflow-hidden">
              <motion.div 
                className="w-full h-full bg-gold"
                initial={{ scaleX: 0 }}
                whileInView={{ scaleX: 1 }}
                transition={{ duration: 0.5 }}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
