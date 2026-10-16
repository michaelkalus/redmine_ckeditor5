# frozen_string_literal: true

require_relative '../test_helper'

class RedmineCkeditorOptionsTest < ActiveSupport::TestCase
  def test_czech_language_and_headings
    options = ::I18n.with_locale(:cs) { RedmineCkeditor.options }

    assert_equal 'cs', options[:language]
    assert_equal 'Odstavec', options[:heading][:options][0][:title]
    assert_equal 'Nadpis 2', options[:heading][:options][2][:title]
    assert_equal "Nahr\u00e1v\u00e1m", options[:redmineUpload][:uploadingLabel]
  end

  def test_other_languages_fall_back_to_english_ui
    options = ::I18n.with_locale(:de) { RedmineCkeditor.options }

    assert_equal 'en', options[:language]
  end

  def test_passes_upload_and_mention_configuration
    options = RedmineCkeditor.options(
      upload_url: '/u', file_upload_url: '/u?kind=file', mentions: {usersUrl: '/m'}
    )

    assert_equal '/u', options[:redmineUpload][:uploadUrl]
    assert_equal '/u?kind=file', options[:redmineUpload][:fileUploadUrl]
    assert_equal({usersUrl: '/m'}, options[:redmineMentions])
  end

  def test_image_upload_types_include_avif
    options = RedmineCkeditor.options

    assert_includes options[:image][:upload][:types], 'avif'
    assert_includes options[:image][:toolbar], 'resizeImage'
  end

  def test_toolbar_location_defaults_to_top
    Setting.stubs(:[]).with(:plugin_redmine_ckeditor).returns({})

    assert_equal 'top', RedmineCkeditor.options[:redmineToolbarLocation]
  end

  def test_toolbar_location_bottom
    Setting.stubs(:[]).with(:plugin_redmine_ckeditor).returns('toolbar_location' => 'bottom')

    assert_equal 'bottom', RedmineCkeditor.options[:redmineToolbarLocation]
  end
end
