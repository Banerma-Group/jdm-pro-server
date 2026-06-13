import { z } from "zod";

// Input-validation shape for preset criteria (used by the API + worker). The
// actual match evaluation lives in @jdm-pro/crawler (matchesCriteria), which
// canonicalises makers — see the maker-canonicalization invariant.
export const criteriaSchema = z.object({
  maker: z.string().optional(),
  models: z.array(z.string()).optional(),
  priceMin: z.number().int().nonnegative().optional(),
  priceMax: z.number().int().nonnegative().optional(),
  yearMin: z.number().int().optional(),
  yearMax: z.number().int().optional(),
  mileageMin: z.number().int().nonnegative().optional(),
  mileageMax: z.number().int().nonnegative().optional(),
  bodyTypes: z.array(z.string()).optional(),
  fuelTypes: z.array(z.string()).optional(),
  transmissions: z.array(z.string()).optional(),
  prefectures: z.array(z.string()).optional()
}).strict();
