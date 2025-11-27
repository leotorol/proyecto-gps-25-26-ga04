import React, { createContext, useState, useMemo } from 'react';
import PropTypes from 'prop-types';

export const ConcertContext = createContext({
  selectedConcertId: null,
  setSelectedConcertId: () => {}
});

const ConcertProvider = ({ children }) => {
  const [selectedConcertId, setSelectedConcertId] = useState(null);

  const value = useMemo(() => ({ selectedConcertId, setSelectedConcertId }), [selectedConcertId]);

  return (
    <ConcertContext.Provider value={value}>
      {children}
    </ConcertContext.Provider>
  );
};

ConcertProvider.propTypes = {
  children: PropTypes.node.isRequired,
};

export default ConcertProvider;