import "react";

declare module "react" {
  // React 19's types require an initial ref value. This preserves the
  // no-argument form used by the camera and request-controller refs.
  function useRef<T = undefined>(): MutableRefObject<T | undefined>;
}
