"use client"

import React from "react"

// Dynamic component for development tools
export const DevelopmentTools = () => {
  const [StagewiseComponent, setStagewiseComponent] = React.useState<React.ComponentType<any> | null>(null);

  React.useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      // Dynamic import only in development
      import('@stagewise/toolbar-next').then(({ StagewiseToolbar }) => {
        import('@stagewise-plugins/react').then(({ ReactPlugin }) => {
          const Component = () => (
            <StagewiseToolbar 
              config={{
                plugins: [ReactPlugin]
              }}
            />
          );
          setStagewiseComponent(() => Component);
        });
      }).catch(() => {
        // Silently fail if stagewise packages are not available
        console.log('Stagewise packages not available');
      });
    }
  }, []);

  if (process.env.NODE_ENV !== 'development' || !StagewiseComponent) {
    return null;
  }

  return <StagewiseComponent />;
}; 