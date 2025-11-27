import React, { createContext, useState, useMemo } from 'react';
import PropTypes from 'prop-types';

export const AlbumContext = createContext({
  selectedAlbumId: null,
  setSelectedAlbumId: () => {}
});

const AlbumProvider = ({ children }) => {
  const [selectedAlbumId, setSelectedAlbumId] = useState(null);

  const value = useMemo(() => ({ selectedAlbumId, setSelectedAlbumId }), [selectedAlbumId]);

  return (
    <AlbumContext.Provider value={value}>
      {children}
    </AlbumContext.Provider>
  );
};

AlbumProvider.propTypes = {
  children: PropTypes.node.isRequired,
};

export default AlbumProvider;