import type { Db } from '../../db/client'
import { parseRoadmap, type Roadmap } from '../../lib/roadmap'
import { readSetting, writeSetting } from './settings'

/** The setting `roadmap` (where the two of them are in building the house). Always a
 * value: a missing or broken setting is the default stage */
export async function readRoadmap(db: Db): Promise<Roadmap> {
  return parseRoadmap(await readSetting(db, 'roadmap'))
}

export async function writeRoadmap(db: Db, roadmap: Roadmap): Promise<void> {
  await writeSetting(db, 'roadmap', JSON.stringify(roadmap))
}
