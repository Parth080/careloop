"""Doctors' dosing shorthand, read by fixed rules instead of a model: "1-0-1", OD, BD, TDS, HS, SOS, AC/PC,
"x 10/7". The same words always mean the same schedule, so code gets them right every time, and a reading
model's slip (such as reading OD as 1-0-1) shows up as two readers disagreeing."""

import re
from dataclasses import dataclass
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from .schemas import MedicineDraft

MORNING, NOON, AFTERNOON, EVENING, NIGHT, BEDTIME = "08:00", "12:00", "14:00", "16:00", "21:00", "22:00"

# One amount in a dosing pattern: 0, 1, 2, 3, a half.
AMOUNT = r"(?:0|1|2|3|1/2|0\.5|½)"
PATTERN = re.compile(rf"(?<![\d/.]){AMOUNT}(?:\s*-\s*{AMOUNT}){{2,3}}(?![\d/.])")

# Each entry: words that mean the same schedule. Matched as whole words in lower-case text.
SCHEDULES: list[tuple[str, list[str]]] = [
    (r"o\.?d\.?|q\.?d\.?|once (?:a day|daily)|daily|dly|every morning", [MORNING]),
    (r"b\.?d\.?|b\.?i\.?d\.?|twice (?:a day|daily)|2 times (?:a day|daily)", [MORNING, NIGHT]),
    (r"t\.?d\.?s\.?|t\.?i\.?d\.?|thrice (?:a day|daily)|3 times (?:a day|daily)|three times (?:a day|daily)", [MORNING, AFTERNOON, NIGHT]),
    (r"q\.?i\.?d\.?|q\.?d\.?s\.?|4 times (?:a day|daily)|four times (?:a day|daily)", [MORNING, NOON, EVENING, NIGHT]),
    (r"h\.?s\.?|at bedtime|bedtime", [BEDTIME]),
    (r"at night", [NIGHT]),
    (r"q\.?\s?6\s?h|every 6 (?:hours|hrs?)|6 hourly|6 hrly|cada 6 h(?:oras|rs)?", ["00:00", "06:00", "12:00", "18:00"]),
    (r"q\.?\s?8\s?h|every 8 (?:hours|hrs?)|8 hourly|8 hrly|cada 8 h(?:oras|rs)?", ["06:00", "14:00", "22:00"]),
    (r"q\.?\s?12\s?h|every 12 (?:hours|hrs?)|12 hourly|12 hrly|cada 12 h(?:oras|rs)?", [MORNING, "20:00"]),
]
SCHEDULE_WORDS = [(re.compile(rf"(?<![\w.])(?:{words})(?![\w])"), times) for words, times in SCHEDULES]
# In eye and ear drops, OD means the right eye, not once a day.
EYE_OR_EAR = re.compile(r"\b(?:eye|eyes|ear|ears|gtt|e/d)\b")
ONCE_A_DAY = re.compile(r"(?<![\w.])(?:o\.?d\.?)(?![\w])")

AS_NEEDED = re.compile(r"(?<![\w.])(?:s\.?o\.?s\.?|p\.?r\.?n\.?|as needed|when needed|if needed|when required|as required|if required)(?![\w])")
FOODS = [
    ("before_food", re.compile(r"(?<![\w.])(?:a\.?c\.?|before (?:food|meals?|breakfast|lunch|dinner)|empty stomach)(?![\w])")),
    ("after_food", re.compile(r"(?<![\w.])(?:p\.?c\.?|after (?:food|meals?|breakfast|lunch|dinner))(?![\w])")),
    ("with_food", re.compile(r"(?<![\w.])(?:with (?:food|meals?|breakfast|lunch|dinner))(?![\w])")),
]
# "x 10/7" is 10 days, "x 2/52" 2 weeks, "x 3/12" 3 months.
FRACTION_DURATION = re.compile(r"(?:x|×|for)\s*(\d{1,3})\s*/\s*(7|52|12)(?!\d)")
WORD_DURATION = re.compile(r"(?:(?:x|×|for)\s*)?(\d{1,3})\s*(days?|d|weeks?|wks?|months?|mths?|mo)\b")
DAYS_IN = {"7": 1, "52": 7, "12": 30, "d": 1, "day": 1, "days": 1, "week": 7, "weeks": 7, "wk": 7, "wks": 7}


@dataclass
class Directions:
    """What a medicine line's shorthand says. None: the line doesn't say (or contradicts itself)."""

    times: tuple[str, ...] | None = None
    as_needed: bool | None = None
    food: str | None = None
    duration_days: int | None = None


def tidy(text: str) -> str:
    text = text.lower().replace("½", "1/2").replace("–", "-").replace("—", "-").replace("−", "-")
    return re.sub(r"\s+", " ", text)


def pattern_times(pattern: str) -> tuple[str, ...]:
    amounts = [part.strip() for part in pattern.split("-")]
    slots = [MORNING, AFTERNOON, NIGHT] if len(amounts) == 3 else [MORNING, NOON, EVENING, NIGHT]
    return tuple(slot for slot, amount in zip(slots, amounts) if amount not in ("0",))


def only(values: set) -> object | None:
    return next(iter(values)) if len(values) == 1 else None


def read_directions(line: str) -> Directions:
    """The schedule a prescription line's shorthand gives. Anything it doesn't say, or says two ways, is None."""
    text = tidy(line)
    schedules = {pattern_times(match) for match in PATTERN.findall(text)}
    eye_or_ear = bool(EYE_OR_EAR.search(text))
    for words, times in SCHEDULE_WORDS:
        for match in words.finditer(text):
            if eye_or_ear and ONCE_A_DAY.fullmatch(match.group(0)):
                continue  # "1 drop OD" is the right eye
            schedules.add(tuple(times))
    schedules.discard(())
    if schedules == {(NIGHT,), (BEDTIME,)}:  # "0-0-1 HS": at bedtime
        schedules = {(BEDTIME,)}

    foods = {food for food, words in FOODS if words.search(text)}

    durations = {int(amount) * DAYS_IN[base] for amount, base in FRACTION_DURATION.findall(text)}
    for amount, unit in WORD_DURATION.findall(text):
        durations.add(int(amount) * (30 if unit.startswith("m") else DAYS_IN[unit]))
    durations = {days for days in durations if 1 <= days <= 3650}

    return Directions(
        times=only(schedules),  # type: ignore[arg-type]
        as_needed=True if AS_NEEDED.search(text) else None,
        food=only(foods),  # type: ignore[arg-type]
        duration_days=only(durations),  # type: ignore[arg-type]
    )


def settle(found: list[object], current: object, empty: object) -> tuple[object, bool | None]:
    """Compare what the readings' shorthand says with the draft. Returns the value to use and whether the field is
    now certain (True), doubtful (False) or unchanged (None)."""
    values = [value for value in found if value is not None]
    if not values:
        return current, None
    if len(set(values)) > 1:  # the readers read different shorthand
        return current, False
    value = values[0]
    if len(values) >= 2:  # two readings of the line say the same: the rule decides
        return value, True
    if current == empty:
        return value, False  # only one reading says so: fill it in, but have it checked
    return current, None if current == value else False


def check_directions(medicine: "MedicineDraft", lines: list[str]) -> None:
    """Hold a drafted medicine to its line's shorthand. `lines`: that line as each reader read it."""
    found = [read_directions(line) for line in lines if line]
    if not found:
        return
    flags = list(medicine.unclear)

    def mark(field: str, certain: bool | None) -> None:
        if certain is False and field not in flags:
            flags.append(field)
        elif certain is True and field in flags:
            flags.remove(field)

    as_needed, certain = settle([item.as_needed for item in found], medicine.as_needed or None, None)
    medicine.as_needed = bool(as_needed)
    mark("times", certain)
    if medicine.as_needed:
        if any(item.times for item in found) and not any(item.as_needed for item in found):
            mark("times", False)  # drafted as "when needed", but the line gives a schedule
    else:
        times, certain = settle([item.times for item in found], tuple(medicine.times), ())
        medicine.times = sorted(times)  # type: ignore[arg-type]
        mark("times", certain)
    food, certain = settle([item.food for item in found], medicine.food, None)
    medicine.food = food  # type: ignore[assignment]
    mark("food", certain)
    days, certain = settle([item.duration_days for item in found], medicine.duration_days, None)
    medicine.duration_days = days  # type: ignore[assignment]
    mark("duration", certain)
    medicine.unclear = flags  # type: ignore[assignment]
