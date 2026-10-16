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
end
