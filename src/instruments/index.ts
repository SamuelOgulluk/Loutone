import './builtins/piano'
import './builtins/bass'
import './builtins/guitars'
import './builtins/pads'
import './builtins/drums'
import './builtins/lead'
import './builtins/strings'

export {
  registerInstrument,
  getInstrument,
  listInstruments,
  listInstrumentsByCategory,
  CATEGORY_ORDER,
  CATEGORY_LABELS,
  INSTRUMENT_DND_MIME,
  INSTRUMENT_DND_PREFIX,
  encodeInstrumentDrag,
  parseInstrumentDragPayload,
  isInstrumentDragEvent,
} from './registry'
export type { InstrumentCategory, InstrumentDef, VoiceHandle } from './registry'
