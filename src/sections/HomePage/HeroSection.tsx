import { useEffect, useRef, useState } from 'react';
import Navbar from '../../components/layout/Navbar';
import heroVideo from '../../assets/28_11_25 Monkey-Video-Hero.webm';
import heroVideoMp4 from '../../assets/28_11_25-Monkey-Video-Hero.mp4';
import posterImage from '../../assets/video-poster.jpg';

export default function HeroSection() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [showPoster, setShowPoster] = useState(true);
  const [videoError, setVideoError] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [showPlayButton, setShowPlayButton] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const checkAutoplay = async () => {
      try {
        await video.play();
        setIsPlaying(true);
        setShowPlayButton(false);
      } catch {
        setShowPlayButton(true);
        setIsPlaying(false);
      }
    };

    if (video.readyState >= 2) {
      checkAutoplay();
    } else {
      video.addEventListener('loadeddata', checkAutoplay);
    }

    const handlePlaying = () => {
      setShowPoster(false);
      setIsPlaying(true);
      setShowPlayButton(false);
    };

    const handleError = () => {
      setVideoError(true);
      setShowPoster(false);
    };

    const handleWaiting = () => {
      if (video.paused) setShowPoster(true);
    };

    video.addEventListener('playing', handlePlaying);
    video.addEventListener('error', handleError);
    video.addEventListener('waiting', handleWaiting);

    return () => {
      video.removeEventListener('loadeddata', checkAutoplay);
      video.removeEventListener('playing', handlePlaying);
      video.removeEventListener('error', handleError);
      video.removeEventListener('waiting', handleWaiting);
    };
  }, []);

  const handlePlayClick = async () => {
    if (!videoRef.current) return;
    try {
      await videoRef.current.play();
      setIsPlaying(true);
      setShowPlayButton(false);
    } catch (error) {
      console.error('Error playing video:', error);
    }
  };

  return (
    <section className="relative w-full bg-gray-900 h-[260px] md:h-[500px] lg:h-[650px] xl:h-[800px]">
      {/* Poster inicial */}
      {showPoster && !videoError && (
        <div 
          className="absolute inset-0 bg-cover bg-center z-10"
          style={{ backgroundImage: `url(${posterImage})` }}
        />
      )}

      <video
        ref={videoRef}
        autoPlay
        muted
        loop
        playsInline
        preload="metadata"
        className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-500 ${
          showPoster ? 'opacity-0' : 'opacity-100'
        }`}
        poster={posterImage}
        onError={() => setVideoError(true)}
      >
        <source src={heroVideoMp4} type="video/mp4" />
        <source src={heroVideo} type="video/webm" />
      </video>

      {/* Botón Play (si falla autoplay) */}
      {showPlayButton && !isPlaying && !videoError && (
        <div className="absolute inset-0 flex items-center justify-center z-20">
          <button
            onClick={handlePlayClick}
            className="bg-white/90 hover:bg-white text-gray-900 rounded-full p-8 transition-all hover:scale-110 shadow-2xl"
          >
            <svg className="w-16 h-16 ml-1" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z" />
            </svg>
          </button>
        </div>
      )}

      {/* Fallback de error */}
      {videoError && (
        <div 
          className="absolute inset-0 bg-cover bg-center z-20 flex items-center justify-center"
          style={{ backgroundImage: `url(${posterImage})` }}
        >
          <div className="bg-black/50 text-white p-4 rounded-lg text-center">
            <p className="text-lg mb-2">Video no disponible</p>
            <p className="text-sm opacity-75">Demo Cleaning Co.</p>
          </div>
        </div>
      )}

      <div className="fixed top-0 left-0 right-0 z-[100]">
        <Navbar variant="transparent" />
      </div>
    </section>
  );
}