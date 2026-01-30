/**
 * Safely converts a value to a number.
 * Handles strings with commas and returns 0 for invalid inputs.
 */
export const getNum = (val) => {
    if (val === undefined || val === null || val === "") return 0;

    // Strip out commas if it's a formatting string
    if (typeof val === "string") {
        val = val.replace(/,/g, "");
    }

    const num = Number(val);
    return isNaN(num) ? 0 : num;
};
