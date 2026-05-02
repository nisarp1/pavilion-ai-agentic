import { loadFont as loadManropeFont, fontFamily as manropeFamilyName } from "@remotion/google-fonts/Manrope";
import { loadFont as loadAnekFont, fontFamily as anekFamilyName } from "@remotion/google-fonts/AnekMalayalam";

loadManropeFont("normal", { weights: ["400", "500", "600", "700", "800"] });
loadAnekFont("normal", { weights: ["400", "500", "600", "700", "800"] });

export const MANROPE = manropeFamilyName;
export const ANEK_MALAYALAM = anekFamilyName;
