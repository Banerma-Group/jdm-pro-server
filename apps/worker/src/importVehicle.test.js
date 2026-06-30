import { expect, test } from "bun:test";
import { vehicleAttrsFromListing } from "./importVehicle.js";

test("vehicleAttrsFromListing marks crawler imports as JDM market vehicles", () => {
  const attrs = vehicleAttrsFromListing({
    id: "listing-1",
    maker: "Toyota",
    model: "Supra",
  });

  expect(attrs.market).toBe("JDM");
});
