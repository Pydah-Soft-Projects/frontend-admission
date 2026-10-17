import React from 'react';

declare global {
  namespace JSX {
    interface IntrinsicElements {
      'pydah-sso-loader': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement>;
      'pydah-portal-switcher': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement>;
    }
  }

  namespace React.JSX {
    interface IntrinsicElements {
      'pydah-sso-loader': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement>;
      'pydah-portal-switcher': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement>;
    }
  }
}
