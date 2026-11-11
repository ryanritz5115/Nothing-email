"""Render native Recharge/Jinja source locally, never convert it to Liquid.

Undefined variables fail rendering so local checks catch missing component
inputs and unguarded optional payload fields before pasting into Recharge.
Jinja's built-in filters/tests are real Jinja2. The only Recharge-specific shim
is amount_with_currency; its input is a decimal amount in major currency units,
unlike Shopify's integer-cent money filters. Final parity is checked in Recharge.
"""

import json
import sys
from decimal import Decimal, InvalidOperation

try:
    from babel.numbers import format_currency
    from jinja2 import Environment, StrictUndefined
except ImportError:
    sys.stderr.write("Recharge preview dependencies are missing. Run npm run setup:recharge.\n")
    sys.exit(1)


def amount_with_currency(amount, currency, display_currency_code=False):
    try:
        value = Decimal(str(amount))
    except (InvalidOperation, TypeError, ValueError) as error:
        raise ValueError("amount_with_currency expects a decimal amount in major units") from error
    if not value.is_finite():
        raise ValueError("amount_with_currency expects a finite amount")
    code = str(currency).upper()
    if len(code) != 3 or not code.isalpha():
        raise ValueError("amount_with_currency requires a three-letter currency code")
    formatted = format_currency(value, code, locale="en_US")
    # Babel already displays unknown currency codes in place of a symbol.
    return formatted if not display_currency_code or code in formatted else "{} {}".format(formatted, code)


def main():
    payload = json.load(sys.stdin)
    environment = Environment(autoescape=False, undefined=StrictUndefined, keep_trailing_newline=True)
    environment.filters["amount_with_currency"] = amount_with_currency
    template = environment.from_string(payload["source"])
    if not payload.get("validate_only"):
        sys.stdout.write(template.render(payload.get("context", {})))


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        sys.stderr.write("{}: {}\n".format(type(error).__name__, error))
        sys.exit(1)
