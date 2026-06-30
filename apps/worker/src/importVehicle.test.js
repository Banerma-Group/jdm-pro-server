import { expect, test } from "bun:test";
import { marketIdBySlug } from "./importVehicle.js";

test("marketIdBySlug returns the matching JDM market id", async () => {
  const query = {
    from() {
      return this;
    },
    where() {
      return this;
    },
    limit() {
      return [{ id: 7 }];
    },
  };
  const tx = {
    select() {
      return query;
    },
  };

  await expect(marketIdBySlug(tx, "jdm")).resolves.toBe(7);
});
