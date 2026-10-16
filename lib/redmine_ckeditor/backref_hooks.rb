# frozen_string_literal: true

module RedmineCkeditor
  module JournalBackrefHook
    extend ActiveSupport::Concern

    included do
      attr_accessor :redmine_ckeditor_backref_marker

      after_create_commit :redmine_ckeditor_backref
    end

    private

    def redmine_ckeditor_backref
      IssueMentionBackref.from_journal(self)
    rescue StandardError => e
      Rails.logger.warn("redmine_ckeditor backref hook: #{e.class}: #{e.message}")
    end
  end

  module JournalWatcherPatch
    private

    def add_watcher
      return if redmine_ckeditor_backref_marker

      super
    end
  end

  module IssueBackrefHook
    extend ActiveSupport::Concern

    included do
      after_save :redmine_ckeditor_capture_description
      after_commit :redmine_ckeditor_backref, on: %i[create update]
    end

    private

    def redmine_ckeditor_capture_description
      @redmine_ckeditor_previous_description =
        saved_change_to_description? ? [description_before_last_save] : nil
    end

    def redmine_ckeditor_backref
      change = @redmine_ckeditor_previous_description
      @redmine_ckeditor_previous_description = nil
      IssueMentionBackref.from_issue(self, change.first) if change
    rescue StandardError => e
      Rails.logger.warn("redmine_ckeditor backref hook: #{e.class}: #{e.message}")
    end
  end
end
