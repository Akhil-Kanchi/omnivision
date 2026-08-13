.PHONY: live-tutor stop-live-tutor restart-live-tutor

live-tutor:
	./scripts/start-live-tutor.sh start

stop-live-tutor:
	./scripts/start-live-tutor.sh stop

restart-live-tutor:
	./scripts/start-live-tutor.sh restart
