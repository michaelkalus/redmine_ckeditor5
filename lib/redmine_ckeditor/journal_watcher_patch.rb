# frozen_string_literal: true

module RedmineCkeditor
  module JournalWatcherPatch
    private

    def add_watcher
      return if redmine_ckeditor_backref_marker

      super
    end
  end
end
