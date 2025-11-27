import React, { createContext, useState, useMemo } from 'react';
import PropTypes from 'prop-types';

export const RegisterContext = createContext({
  registerType: '',
  setRegisterType: () => {}
});

const RegisterProvider = ({ children }) => {
  const [registerType, setRegisterType] = useState('');

  const value = useMemo(() => ({ registerType, setRegisterType }), [registerType]);

  return (
    <RegisterContext.Provider value={value}>
      {children}
    </RegisterContext.Provider>
  );
};

RegisterProvider.propTypes = {
  children: PropTypes.node.isRequired,
};

export default RegisterProvider;