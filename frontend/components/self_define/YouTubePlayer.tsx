"use client";
import React, { useState, useEffect } from 'react';
import { Play } from 'lucide-react';

interface YouTubePlayerProps {
  videoId: string;
  className?: string;
}

const YouTubePlayer: React.FC<YouTubePlayerProps> = ({
  videoId,
  className = ''
}) => {
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [thumbnailLoaded, setThumbnailLoaded] = useState<boolean>(false);
  const [currentThumbnail, setCurrentThumbnail] = useState<string>('');
  
  const thumbnailUrl = `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;
  const fallbackUrl = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
  const embedUrl = `https://www.youtube.com/embed/${videoId}?autoplay=1`;

  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      setCurrentThumbnail(img.src);
      setThumbnailLoaded(true);
    };
    img.onerror = () => {
      img.src = fallbackUrl;
    };
    img.src = thumbnailUrl;
  }, [videoId, thumbnailUrl, fallbackUrl]);

  return (
    <div className={`relative w-full max-w-5xl mx-auto ${className}`}>
      <div className="relative pb-[56.25%]">
      {!isPlaying ? (
          <div className="absolute top-0 left-0 w-full h-full">
          {currentThumbnail && (
            <img
              src={currentThumbnail}
              alt="Video thumbnail"
              className="w-full h-full object-cover"
            />
          )}
          {thumbnailLoaded && (
            <button
              onClick={() => setIsPlaying(true)}
              className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 
                       bg-black bg-opacity-70 hover:bg-opacity-90 rounded-full p-4
                       transition-all duration-300 ease-in-out z-10"
              aria-label="Play video"
            >
              <Play size={48} className="text-white" />
            </button>
          )}
        </div>
      ) : (
        <iframe
          src={embedUrl}
          className="absolute top-0 left-0 w-full h-full"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          title="YouTube video player"
        />
      )}
      </div>
    </div>
  );
};

export default YouTubePlayer;