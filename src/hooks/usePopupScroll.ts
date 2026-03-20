import { useCallback, useState } from "react";

interface PopupScrollState {
  cursor: number;
  setCursor: React.Dispatch<React.SetStateAction<number>>;
  scrollOffset: number;
  setScrollOffset: React.Dispatch<React.SetStateAction<number>>;
  adjustScroll: (nextCursor: number) => void;
  resetScroll: () => void;
}

export function usePopupScroll(maxVisible: number): PopupScrollState {
  const [cursor, setCursor] = useState(0);
  const [scrollOffset, setScrollOffset] = useState(0);

  const adjustScroll = useCallback(
    (nextCursor: number) => {
      setScrollOffset((prev) => {
        if (nextCursor < prev) return nextCursor;
        if (nextCursor >= prev + maxVisible) return nextCursor - maxVisible + 1;
        return prev;
      });
    },
    [maxVisible],
  );

  const resetScroll = useCallback(() => {
    setCursor(0);
    setScrollOffset(0);
  }, []);

  return { cursor, setCursor, scrollOffset, setScrollOffset, adjustScroll, resetScroll };
}
