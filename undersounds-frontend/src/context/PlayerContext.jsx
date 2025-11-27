import React, { createContext, useState, useContext, useCallback, useMemo } from 'react';
import PropTypes from 'prop-types';

export const PlayerContext = createContext({
  currentTrack: null,
  isPlaying: false,
  volume: 1,
  playTrack: () => {},
  pauseTrack: () => {},
  stopTrack: () => {},
  changeVolume: () => {}
});

export const PlayerProvider = ({ children }) => {
  const [currentTrack, setCurrentTrack] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolume] = useState(1); // 0..1

  const playTrack = useCallback((track) => {
    setCurrentTrack(track);
    setIsPlaying(true);
  }, []);

  const pauseTrack = useCallback(() => {
    setIsPlaying(false);
  }, []);

  const stopTrack = useCallback(() => {
    setCurrentTrack(null);
    setIsPlaying(false);
  }, []);

  const changeVolume = useCallback((newVolume) => {
    setVolume(newVolume);
  }, []);

  const value = useMemo(() => ({
    currentTrack,
    isPlaying,
    volume,
    playTrack,
    pauseTrack,
    stopTrack,
    changeVolume
  }), [currentTrack, isPlaying, volume, playTrack, pauseTrack, stopTrack, changeVolume]);

  return (
    <PlayerContext.Provider value={value}>
      {children}
    </PlayerContext.Provider>
  );
};

PlayerProvider.propTypes = {
  children: PropTypes.node.isRequired,
};

export const usePlayer = () => useContext(PlayerContext);