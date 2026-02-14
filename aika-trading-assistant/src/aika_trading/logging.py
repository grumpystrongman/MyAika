import logging
import sys


def setup_logging(level: str = "INFO") -> None:
    logging.basicConfig(
        level=level,
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
        handlers=[logging.StreamHandler(sys.stdout)],
    )


class RedactingFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        msg = str(record.getMessage())
        for token in ("authorization", "secret", "token", "apikey", "api_key"):
            if token in msg.lower():
                record.msg = "[redacted]"
                record.args = ()
        return True


def apply_redaction(logger: logging.Logger) -> None:
    logger.addFilter(RedactingFilter())
