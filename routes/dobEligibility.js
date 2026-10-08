/*
 * Shared date-of-birth validation for every registration route.
 *
 * The frontend date pickers are only a convenience - they can be bypassed by
 * calling the API directly - so the rules live here, on the server, and run
 * BEFORE any database connection, transaction or ID generation happens.
 *
 * Two separate concerns are handled here:
 *   1. Is this a real, strictly formatted, non-future date of birth?
 *   2. Is the resulting age eligible for the program being applied to?
 *
 * The original `dob` string is never rewritten: students and faculty are both
 * looked up later by exact `dob = ?` string match, so re-serialising the value
 * here would silently break login and the forgot-ID recovery flow.
 */

/* Age windows, in completed years, for the two programs the site offers.
 * Both bounds are inclusive. */
const PROGRAM_AGE_LIMITS = {
    INTERMEDIATE: { min: 13, max: 25, label: 'the Intermediate program' },
    GATE: { min: 17, max: 35, label: 'the GATE program' }
};

/* A faculty member has to be an adult. There is deliberately no upper bound. */
const FACULTY_MIN_AGE = 18;

/* Matches an ISO calendar date and nothing else. `new Date('2015-02-31')` does
 * not fail - it silently rolls over to 3 March - so the shape is checked first
 * and then verified to round-trip. */
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Parses a strict YYYY-MM-DD date, treating it as UTC midnight.
 * Returns null for anything that is not a real calendar date.
 */
function parseIsoDate(value) {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    const match = ISO_DATE.exec(trimmed);
    if (!match) return null;

    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);

    if (month < 1 || month > 12 || day < 1 || day > 31) return null;

    const parsed = new Date(Date.UTC(year, month - 1, day));
    // Rejects impossible days such as 31 February, which Date would roll over.
    if (
        parsed.getUTCFullYear() !== year ||
        parsed.getUTCMonth() !== month - 1 ||
        parsed.getUTCDate() !== day
    ) {
        return null;
    }

    return parsed;
}

/** Today's date as UTC midnight, taken from the server's local calendar day. */
function todayUtcMidnight() {
    const now = new Date();
    return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
}

/** Completed years between a UTC-midnight DOB and a UTC-midnight reference. */
function completedAge(dobDate, reference) {
    let age = reference.getUTCFullYear() - dobDate.getUTCFullYear();
    const monthDiff = reference.getUTCMonth() - dobDate.getUTCMonth();
    if (monthDiff < 0 || (monthDiff === 0 && reference.getUTCDate() < dobDate.getUTCDate())) {
        age -= 1;
    }
    return age;
}

/**
 * Validates the format of a date of birth and rejects future dates.
 * @returns {{ ok: true, date: Date } | { ok: false, message: string }}
 */
function validateDobFormat(dob, invalidMessage) {
    const parsed = parseIsoDate(dob);
    if (!parsed) {
        return { ok: false, message: invalidMessage };
    }
    if (parsed.getTime() > todayUtcMidnight().getTime()) {
        return { ok: false, message: 'Date of Birth cannot be a future date' };
    }
    return { ok: true, date: parsed };
}

/**
 * Maps a student domain onto its program so the right age window is applied.
 * Mirrors the domain handling used later for ID prefixes and fees:
 * MTECH-* domains are the GATE program, MPC-JEE and BIPC-NEET are Intermediate.
 */
function programForDomain(domain) {
    if (typeof domain !== 'string') return null;
    if (domain === 'MPC-JEE' || domain === 'BIPC-NEET') return 'INTERMEDIATE';
    if (domain.startsWith('MTECH')) return 'GATE';
    return null;
}

/**
 * Validates a student registration: real non-future DOB, a known domain, and an
 * age that falls inside the age window for that domain's program.
 */
function validateStudentEligibility(name, dob, domain) {
    const format = validateDobFormat(dob, 'Invalid date of birth format');
    if (!format.ok) return format;

    const program = programForDomain(domain);
    if (!program) {
        return { ok: false, message: 'Invalid domain' };
    }

    const limits = PROGRAM_AGE_LIMITS[program];
    const age = completedAge(format.date, todayUtcMidnight());

    if (age < limits.min || age > limits.max) {
        return {
            ok: false,
            message:
                'Age ' + age + ' is not eligible for ' + limits.label +
                '. Eligible age range is ' + limits.min + ' to ' + limits.max + ' years.'
        };
    }

    return { ok: true, age, program };
}

/** Validates a faculty registration: real non-future DOB and adult age. */
function validateFacultyEligibility(dob, invalidMessage) {
    const format = validateDobFormat(dob, invalidMessage || 'Invalid date of birth');
    if (!format.ok) return format;

    const age = completedAge(format.date, todayUtcMidnight());
    if (age < FACULTY_MIN_AGE) {
        return {
            ok: false,
            message: 'Faculty must be at least ' + FACULTY_MIN_AGE + ' years old.'
        };
    }

    return { ok: true, age };
}

module.exports = {
    FACULTY_MIN_AGE,
    PROGRAM_AGE_LIMITS,
    completedAge,
    parseIsoDate,
    programForDomain,
    validateDobFormat,
    validateFacultyEligibility,
    validateStudentEligibility
};