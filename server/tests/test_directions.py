import pytest

from server.directions import check_directions, read_directions
from server.schemas import MedicineDraft


@pytest.mark.parametrize(
    ("line", "times"),
    [
        ("Tab Telma 40 1-0-0 x 1 month", ("08:00",)),
        ("Tab Metformin 500 1 - 0 - 1", ("08:00", "21:00")),
        ("Tab X 1-1-1", ("08:00", "14:00", "21:00")),
        ("Tab X 1/2-0-1/2", ("08:00", "21:00")),
        ("Tab X ½–0–½", ("08:00", "21:00")),
        ("Syp X 5 ml 1-1-1-1", ("08:00", "12:00", "16:00", "21:00")),
        ("Tabs Calcium Sandoz 1 OD x 10/7", ("08:00",)),
        ("Tab Glycomet 500 BD after food", ("08:00", "21:00")),
        ("Tab Y b.i.d.", ("08:00", "21:00")),
        ("Cap Amoxicillin 500 TDS x 5 days", ("08:00", "14:00", "21:00")),
        ("Tab Z qid", ("08:00", "12:00", "16:00", "21:00")),
        ("Tab Ecosprin 75 HS", ("22:00",)),
        ("Tab Ecosprin 75 0-0-1 HS", ("22:00",)),
        ("Paracetamol 500 q6h", ("00:00", "06:00", "12:00", "18:00")),
        ("Cefuro 1000 cada 6 hrs", ("00:00", "06:00", "12:00", "18:00")),
        ("Tab Calcium + Vit D 800 IU daily x 3/12", ("08:00",)),
    ],
)
def test_dosing_shorthand_gives_the_times(line, times):
    assert read_directions(line).times == times


@pytest.mark.parametrize(
    "line",
    [
        "Tab Telma 40 x 1 month",  # no schedule written
        "Tab X 1-0-1 TDS",  # two schedules: a person decides
        "Moxifloxacin eye drops 1 drop OD",  # OD is the right eye here
        "Tab Pan-D 40 Dr. 5-10-26",  # a date, not a pattern
        "Tab Food 40",  # "od" inside a word
    ],
)
def test_lines_without_one_clear_schedule_give_no_times(line):
    assert read_directions(line).times is None


@pytest.mark.parametrize(
    ("line", "food"),
    [
        ("Cap Pan-D 1-0-0 before breakfast", "before_food"),
        ("Tab X 1-0-1 AC", "before_food"),
        ("Tab X on an empty stomach", "before_food"),
        ("Tab Glycomet 500 BD after food", "after_food"),
        ("Tab X 1-0-1 p.c.", "after_food"),
        ("Tab X with meals", "with_food"),
        ("Tab X 1 before breakfast, 1 after dinner", None),
        ("Tab X 1-0-1", None),
    ],
)
def test_food_timing(line, food):
    assert read_directions(line).food == food


@pytest.mark.parametrize(
    ("line", "days"),
    [
        ("Tab X 1-0-0 x 5 days", 5),
        ("Tab X 1-0-0 x 10/7", 10),
        ("Tab X 1-0-0 x 2/52", 14),
        ("Tab X 1-0-0 x 3/12", 90),
        ("Tab Telma 40 1-0-0 x 1 month", 30),
        ("Tab X for 2 weeks", 14),
        ("Tab Telma 40 1-0-0", None),
        ("Tab X x 5 days then x 3 days", None),
    ],
)
def test_duration(line, days):
    assert read_directions(line).duration_days == days


def test_when_needed():
    assert read_directions("Tab Dolo 650 SOS for fever").as_needed is True
    assert read_directions("Tab X 1 prn").as_needed is True
    assert read_directions("Tab X 1-0-1").as_needed is None


def medicine(**fields) -> MedicineDraft:
    return MedicineDraft.model_validate({"name": "Calcium Sandoz", **fields})


def test_two_readings_of_the_shorthand_overrule_the_draft():
    drafted = medicine(times=["08:00", "21:00"], unclear=["times"])

    check_directions(drafted, ["Tabs Calcium Sandoz 1 OD x 10/7", "Tabs Calcium Sandoz 1 od x 10/7"])

    assert drafted.times == ["08:00"]
    assert drafted.duration_days == 10
    assert drafted.unclear == []


def test_one_reading_fills_gaps_but_is_checked():
    drafted = medicine(times=["08:00", "21:00"])

    check_directions(drafted, ["Tabs Calcium Sandoz 1 OD x 10/7"])

    assert drafted.times == ["08:00", "21:00"]  # one reading against the draft: a person decides
    assert drafted.duration_days == 10  # nothing drafted, so it's filled in
    assert set(drafted.unclear) == {"times", "duration"}


def test_readers_who_read_different_shorthand_flag_it():
    drafted = medicine(times=["08:00"])

    check_directions(drafted, ["Tabs Calcium Sandoz 1 OD", "Tabs Calcium Sandoz 1-0-1"])

    assert drafted.times == ["08:00"]
    assert drafted.unclear == ["times"]


def test_a_schedule_on_a_when_needed_medicine_is_flagged():
    drafted = medicine(as_needed=True)

    check_directions(drafted, ["Tab X 1-0-1", "Tab X 1-0-1"])

    assert drafted.as_needed is True
    assert drafted.unclear == ["times"]
