import { HttpError } from "./http";
import { collectionNameTaken } from "./repo";
import { cleanText, MAX_COLLECTION_NAME_LENGTH } from "./wardrobe";

export const COLLECTION_NOT_FOUND = "That collection wasn't found.";

/** Validates `{ name }` for creating or renaming a collection; names are unique per user, ignoring case. */
export function readCollectionName(userId: string, body: Record<string, unknown>, exceptId: string | null = null): string {
  const name = cleanText(body.name, MAX_COLLECTION_NAME_LENGTH);
  if (!name) throw new HttpError("Please give the collection a name.", 400);
  if (collectionNameTaken(userId, name, exceptId)) {
    throw new HttpError(`You already have a collection called “${name}”.`, 409);
  }
  return name;
}
