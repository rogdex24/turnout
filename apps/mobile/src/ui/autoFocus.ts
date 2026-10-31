import { createContext } from "react";

/**
 * False inside a story matrix, where an input asked to take focus does not. Four copies of a screen would each take focus, and
 * the keyboard then scrolls the matrix to the last copy. True, the app's normal state, everywhere else.
 */
export const AutoFocusContext = createContext(true);
